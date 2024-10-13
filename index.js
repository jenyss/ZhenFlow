import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));  // Serve static files from public folder

// Get Jira credentials from environment variables
const jiraEmail = process.env.JIRA_EMAIL;
const jiraApiToken = process.env.JIRA_API_TOKEN;
const jiraUrl = process.env.JIRA_URL;
const openAIToken = process.env.OPENAI_TOKEN;

// Check if Jira environment variables are set
if (!jiraEmail || !jiraApiToken || !jiraUrl) {
    console.error('Please set JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_URL in your .env file.');
    process.exit(1); // Exit the process if env variables are not set
}


// =========================================== OPENAI FUNCTIONS ===========================================

// Call to OpenAI to break down the Congluence page content into Jira tickets
app.post('/break-down-content', async (req, res) => {
    const { content } = req.body;  // Expect the content from the frontend

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
                        content: `
                            Find the "Requirements" section and break down only the content from this section into separate Jira tickets with the following structure for each ticket:
                            1. "summary" - a high-level description of the task (used as the title of the Jira ticket).
                            2. "description" - this should contain:
                                2.1 "goal" - a brief explanation of the purpose of the task.
                                2.2 "requirements" - a detailed description of the requirements or steps to implement.

                            Content to be broken down:
                            ${content}
                        `
                    }
                ],
                max_tokens: 2048,  // Adjust token limit based on content size and response length
                temperature: 0.7
            })
        });

        const responseData = await response.json();

        // Ensure the response is properly structured and send it back to the frontend
        if (responseData.choices && responseData.choices.length > 0) {
            const tasksText = responseData.choices[0].message.content;
            console.log("Tasks extracted from content:", tasksText);

            res.status(200).json({ tasksText });
        } else {
            res.status(500).json({ error: "Failed to extract tasks from content." });
        }
    } catch (error) {
        console.error("Error calling OpenAI API:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// =========================================== JIRA FUNCTIONS =========================================== 

// Create Jira Epic
app.post('/create-epic', async (req, res) => {
    const { projectKey, summary, issueTypeId } = req.body;

    const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')}`;

    try {
        const response = await fetch(`${jiraUrl}/rest/api/3/issue`, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                fields: {
                    project: { key: projectKey },
                    summary: summary,
                    issuetype: { id: issueTypeId },
                },
            }),
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

// Check if Jira Epic with the same Summary exists
app.post('/check-epic', async (req, res) => {
    const { epicTitle, projectKey } = req.body;

    const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')}`;

    try {
        const searchResponse = await fetch(`${jiraUrl}/rest/api/3/search?jql=project=${projectKey} AND summary~"${epicTitle}" AND issuetype=Epic`, {
            method: 'GET',
            headers: {
                "Authorization": authHeader,
                "Content-Type": "application/json"
            }
        });

        const searchData = await searchResponse.json();

        if (searchData.total > 0) {
            return res.status(200).json({ message: "Epic already exists", key: searchData.issues[0].key });
        }

        // If not exists, create new Epic
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
        console.error('Error checking/creating Epic:', error);
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


// Update Confluence page with the created Jira tickets
app.post('/update-confluence-page', async (req, res) => {
    const { pageUrl, jiraLinks } = req.body;

    const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')}`;

    try {
        console.log("Starting Confluence page update...");

        // Extract the page ID from the provided URL
        const pageIdMatch = pageUrl.match(/\/pages\/(\d+)\//);
        if (!pageIdMatch || !pageIdMatch[1]) {
            console.error("Page ID not found in the provided URL.");
            return res.status(400).json({ error: "Page ID not found in the provided URL." });
        }
        const pageId = pageIdMatch[1];
        console.log("Page ID extracted:", pageId);

        // Fetch the current content of the Confluence page
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
        const currentContent = pageData.body.storage.value;  // Get the current page content
        console.log("Current page content fetched.");

        // Prepare the new Jira ticket links in an expandable section
        const jiraLinksContent = jiraLinks.map((link, index) => `
            <ac:structured-macro ac:name="expand">
                <ac:parameter ac:name="title">Jira Ticket ${index + 1}</ac:parameter>
                <ac:rich-text-body>
                    <p>${link}</p>
                </ac:rich-text-body>
            </ac:structured-macro>
        `).join('');

        // New content: append the Jira links at the end of the current content
        const updatedContent = `
            ${currentContent}
            <h3>Jira Tickets</h3>
            ${jiraLinksContent}
        `;

        // Send the request to update the Confluence page
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

        console.log("Confluence page updated successfully:", updateData);
        res.status(200).json({ message: 'Confluence page updated successfully', data: updateData });

    } catch (error) {
        console.error("Error updating Confluence page:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

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


