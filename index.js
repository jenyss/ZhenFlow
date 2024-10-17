import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import cors from 'cors';

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));  // Serve static files from public folder

// Get Jira credentials from environment variables
export const jiraEmail = process.env.JIRA_EMAIL;
export const jiraApiToken = process.env.JIRA_API_TOKEN;
export const jiraUrl = process.env.JIRA_URL;
export const openAIToken = process.env.OPENAI_TOKEN;


// Check if Jira environment variables are set
if (!jiraEmail || !jiraApiToken || !jiraUrl) {
    console.error('Please set JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_URL in your .env file.');
    process.exit(1); // Exit the process if env variables are not set
}


// =========================================== OPENAI FUNCTIONS ===========================================

app.post('/break-down-content', async (req, res) => {
    const { content } = req.body;  // Receive content and structure from frontend

    // Define a base prompt where you can pass different description structures
    const prompt = `
    Find the "Requirements" section and break down only the content from under this section into separate Jira tickets. 
    For each ticket, match the output to follow exactly the format provided below.

    Summary: <This is a high-level description of the task (used as the summary of the Jira ticket)>
    Description: <This should contain>
        Goal:
            <Must contain a concise explanation of the task purpose.>
        Requirements:
            <Specific steps to complete the task.>

    Example 1:
        Summary: I want to learn how to work with AI
        Description:
            Goal:
                My goal is to learn how to use LLMs efficiently
            Requirements:
                1. Take a course on LLMs
                2. Train LLMs
                3. White a chatbot

    Example 2:
        Summary: My next taks is to learn how to code
        Description:
            Goal:
                Learn how to code
            Requirements:
                1. Task1
                2. Task2

    Example 3:
        Summary: Working with promopts
        Description:
            Goal:
                Learn how to use prompts
            Requirements:
                1. Learn what is a prompt
                2. Create some prompts

    Content to be broken down:
    ${content}
`;



    try {
        const tasksText = await callOpenAI(content, prompt);  // Call OpenAI with the provided prompt

        res.status(200).json({ tasksText });  // Return the extracted tasks back to frontend
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});


//Call OpenAI to break down the Requirements into separate tickets
async function callOpenAI(content, prompt) {
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${openAIToken}`  // Use the token from environment
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 2048,  // Adjust token limit based on content size and response length
                temperature: 0.2
            })
        });

        const responseData = await response.json();

        // Check if we have valid data
        if (responseData.choices && responseData.choices.length > 0) {
            const tasksText = responseData.choices[0].message.content;
            console.log("Tasks extracted from content:", tasksText);
            return tasksText;  // Return the extracted tasks
        } else {
            throw new Error("Failed to extract tasks from content.");
        }
    } catch (error) {
        console.error("Error calling OpenAI API:", error);
        throw error;
    }
}

app.post('/create-embedding', async (req, res) => {
    const { text } = req.body;  // Receive content from the frontend

    try {
        const response = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${openAIToken}`  // Use the token from environment
            },
            body: JSON.stringify({
                model: "text-embedding-ada-002",
                input: text
            })
        });

        const responseData = await response.json();

        // Check if we have a valid response
        if (responseData.data && responseData.data.length > 0) {
            const embedding = responseData.data[0].embedding;
            console.log("Embedding created:", embedding);
            
            // Send the embedding back to the frontend
            res.status(200).json({ embedding });  // Respond with the embedding data
        } else {
            throw new Error("Failed to create embedding.");
        }
    } catch (error) {
        console.error("Error creating embedding:", error);
        res.status(500).json({ error: 'Failed to create embedding' });  // Send an error response
    }
});

// Add this function to your existing index.js

// Endpoint to send reasoning prompt to OpenAI
app.post('/get-openai-response', async (req, res) => {
    const { reasoningPrompt } = req.body;

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${openAIToken}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: reasoningPrompt }],
                max_tokens: 300,
                temperature: 0.7
            })
        });

        const responseData = await response.json();

        if (!response.ok) {
            console.error("Error from OpenAI:", responseData);
            return res.status(response.status).json({ error: "Failed to get response from OpenAI", details: responseData });
        }

        res.status(200).json({ content: responseData.choices[0].message.content });
    } catch (error) {
        console.error("Error communicating with OpenAI:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// =========================================== JIRA FUNCTIONS =========================================== 


// Check if Jira Epic with the same Summary exists
app.post('/check-epic', async (req, res) => {
    const { epicTitle, projectKey } = req.body;

    const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')}`;

    try {
        // JQL query passed as part of the URL for GET request
        const jqlQuery = `project="${projectKey}" AND summary~"${epicTitle}" AND issuetype=Epic`;
        const searchResponse = await fetch(`${jiraUrl}/rest/api/3/search?jql=${encodeURIComponent(jqlQuery)}`, {
            method: 'GET',
            headers: {
                "Authorization": authHeader,
                "Content-Type": "application/json"
            }
        });

        if (!searchResponse.ok) {
            return res.status(searchResponse.status).json({ error: 'Failed to fetch from Jira API' });
        }

        const searchData = await searchResponse.json();

        if (searchData.total > 0) {
            return res.status(200).json({ message: "Epic already exists", key: searchData.issues[0].key });
        }

        res.status(200).json({ message: "Epic does not exist" });
    } catch (error) {
        console.error('Error checking Epic:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create Jira Epic if it does not exist
app.post('/create-epic', async (req, res) => {
    const { epicTitle, projectKey } = req.body;

    const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')}`;

    try {
        const response = await fetch(`${jiraUrl}/rest/api/3/issue`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fields: {
                    project: { key: projectKey },
                    summary: epicTitle,
                    issuetype: { name: "Epic" }
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data });
        }

        res.status(201).json({ key: data.key });
    } catch (error) {
        console.error('Error creating Epic:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Create Jira ticket(s) in an Epic
app.post('/create-ticket', async (req, res) => {
    const { epicKey, ticketSummary, description, projectKey } = req.body;

    const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')}`;

    // Convert the description into ADF format
    const descriptionADF = {
        "type": "doc",
        "version": 1,
        "content": [
            {
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": description // This is your plain text description
                    }
                ]
            }
        ]
    };

    try {
        console.log("Creating Jira ticket with the following data:");
        console.log("Epic Key:", epicKey);
        console.log("Ticket Summary:", ticketSummary);
        console.log("Description (ADF):", JSON.stringify(descriptionADF, null, 2));
        console.log("Project Key:", projectKey);

        const response = await fetch(`${jiraUrl}/rest/api/3/issue`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                fields: {
                    project: { key: projectKey },
                    summary: ticketSummary,
                    description: descriptionADF,  // Sending description as ADF
                    issuetype: { name: "Story" },  // Creating a Story in Jira
                    parent: { key: epicKey }       // Parent Epic
                },
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Error creating Jira ticket:", data);
            return res.status(response.status).json({ error: data });
        }

        console.log("Jira Ticket Created:", data);
        res.status(201).json({ key: data.key });
    } catch (error) {
        console.error('Error creating Jira ticket:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add this function to your existing index.js

// Fetch all issues from Jira based on project key
app.post('/fetch-jira-issues', async (req, res) => {
    const { projectKey } = req.body;
    const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')}`;

    try {
        const jqlQuery = `project=${projectKey}`;
        const issuesResponse = await fetch(`${jiraUrl}/rest/api/3/search?jql=${encodeURIComponent(jqlQuery)}&expand=renderedFields,names,properties,editmeta`, {
            method: 'GET',
            headers: {
                "Authorization": authHeader,
                "Content-Type": "application/json"
            }
        });

        if (!issuesResponse.ok) {
            return res.status(issuesResponse.status).json({ error: 'Failed to fetch issues from Jira' });
        }

        const issuesData = await issuesResponse.json();
        res.status(200).json({ issues: issuesData.issues });
    } catch (error) {
        console.error("Error fetching Jira issues:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =========================================== CONFLUENCE FUNCTIONS ===========================================

//Printing confluence page
app.post('/get-confluence-page-print', async (req, res) => {
    const { pageUrl } = req.body;

    const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')}`;

    try {
        // Extract the page ID from the URL
        const pageIdMatch = pageUrl.match(/\/pages\/(\d+)\//);
        if (!pageIdMatch || !pageIdMatch[1]) {
            throw new Error("Page ID not found in URL");
        }
        const pageId = pageIdMatch[1];  // Extract the page ID

        // Fetch the full Confluence page content, including multiple formats
        const response = await fetch(`${jiraUrl}/wiki/rest/api/content/${pageId}?expand=body.storage,body.view,body.editor`, {
            method: 'GET',
            headers: {
                "Authorization": authHeader,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: `Failed to fetch page from Confluence. Status: ${response.status}` });
        }

        const pageData = await response.json();
        const contentStorage = pageData.body.storage.value;
        const contentEditor = pageData.body.editor.value;
        const contentView = pageData.body.view.value;

        // Return the content in all available formats
        res.status(200).json({
            storageContent: contentStorage,
            editorContent: contentEditor,
            viewContent: contentView,
            title: pageData.title
        });

    } catch (error) {
        console.error("Error fetching Confluence page content:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Fetch the Confluence page content
app.post('/get-confluence-page', async (req, res) => {
    const { pageUrl } = req.body;

    const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')}`;

    try {
        // Extract the page ID from the URL
        const pageIdMatch = pageUrl.match(/\/pages\/(\d+)\//);
        if (!pageIdMatch || !pageIdMatch[1]) {
            throw new Error("Page ID not found in URL");
        }
        const pageId = pageIdMatch[1];  // Extract the page ID

        // Fetch the Confluence page content
        const response = await fetch(`${jiraUrl}/wiki/rest/api/content/${pageId}?expand=body.storage`, {
            method: 'GET',
            headers: {
                "Authorization": authHeader,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: `Failed to fetch page from Confluence. Status: ${response.status}` });
        }

        const pageData = await response.json();
        const content = pageData.body.storage.value;
        const title = pageData.title;
        const jiraProject = extractProjectFromContent(content);  // Assuming the project key is embedded in the content

        res.status(200).json({ content, title, jiraProject });

    } catch (error) {
        console.error("Error fetching Confluence page content:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Helper function to extract the project key from Confluence page content
function extractProjectFromContent(content) {
    // Implement logic to extract Jira project name/key from the page content
    const projectMatch = content.match(/Project:\s*([A-Z]+)\b/); // Assuming "Project: <key>" is mentioned in the content
    if (projectMatch && projectMatch[1]) {
        return projectMatch[1];
    }
    throw new Error("Jira project key not found in Confluence content");
}


//Update Confluence page with created Epic
app.post('/update-confluence-page-with-epic', async (req, res) => {
    const { pageUrl, epicKey } = req.body;

    const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')}`;

    try {
        // Extract the page ID from the provided URL
        const pageIdMatch = pageUrl.match(/\/pages\/(\d+)\//);
        if (!pageIdMatch || !pageIdMatch[1]) {
            console.error("Page ID not found in the provided URL.");
            return res.status(400).json({ error: "Page ID not found in the provided URL." });
        }
        const pageId = pageIdMatch[1];
        console.log("Page ID extracted:", pageId);

        // Fetch the current version and content of the Confluence page
        const getPageResponse = await fetch(`${jiraUrl}/wiki/rest/api/content/${pageId}?expand=body.storage,version`, {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            }
        });

        if (!getPageResponse.ok) {
            console.error("Failed to fetch page data:", getPageResponse.statusText);
            return res.status(getPageResponse.status).json({ error: "Failed to fetch page data." });
        }

        const pageData = await getPageResponse.json();
        const currentVersion = pageData.version.number;
        const currentContent = pageData.body.storage.value;

        console.log("Current page version:", currentVersion);

        // Add the expand section with the embedded Epic link at the bottom of the current content
        const epicExpandSection = `
            <ac:structured-macro ac:name="expand" ac:schema-version="1" ac:macro-id="unique-macro-id">
                <ac:parameter ac:name="title">Jira Epic</ac:parameter>
                <ac:rich-text-body>
                    <a href="https://jenys.atlassian.net/browse/${epicKey}" data-layout="center" data-width="100.00" data-card-appearance="embed">${epicKey}</a>
                    <p></p>
                </ac:rich-text-body>
            </ac:structured-macro>
        `;

        const updatedContent = currentContent + epicExpandSection;

        // Send the request to update the Confluence page with the new content
        const updateResponse = await fetch(`${jiraUrl}/wiki/rest/api/content/${pageId}`, {
            method: 'PUT',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                version: { number: currentVersion + 1 },
                title: pageData.title,  // Keep the same title
                type: 'page',
                body: {
                    storage: {
                        value: updatedContent,
                        representation: 'storage'
                    }
                }
            })
        });

        const updateData = await updateResponse.json();
        if (!updateResponse.ok) {
            console.error("Failed to update Confluence page:", updateData);
            return res.status(updateResponse.status).json({ error: updateData.message || 'Failed to update Confluence page' });
        }

        console.log("Confluence page updated successfully with Epic link.");
        res.status(200).json({ message: 'Confluence page updated successfully', data: updateData });

    } catch (error) {
        console.error("Error updating Confluence page:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


