export async function processConfluencePage(userInput) {
    const responseDiv = document.getElementById("response");
    responseDiv.innerHTML = "Processing the Confluence page...";

    try {
        // Step 1: Fetch Confluence page content and extract the Jira project
        console.log("Fetching Confluence page content...");
        const { content, title, jiraProject } = await getConfluencePageContent(userInput);

        // Step 2: Embed the content using OpenAI's API and break it down into granular tickets
        console.log("Creating embedding and breaking down content into granular tasks...");
        const tickets = await breakDownContent(content);
        
        // Debugging: Log the tickets array
        console.log("Tickets array:", tickets);
        console.log("Number of tickets:", tickets.length);

        // If no tickets are found, exit
        if (!tickets || tickets.length === 0) {
            console.error("No tickets to process.");
            responseDiv.innerHTML = "No tasks found to create Jira tickets.";
            return;
        }

        // Step 3: Check if Epic already exists in the Jira project
        console.log(`Checking if Epic '${title}' exists in project '${jiraProject}'...`);
        const epicKey = await createJiraEpicIfNotExists(title, jiraProject);
        if (!epicKey) {
            responseDiv.innerHTML = "Epic already created.";
            return;
        }
        
        // Step 4: Define and call the processTickets function
        async function processTickets(tickets, epicKey, jiraProject) {
            console.log("Creating Jira tickets for each task...");
            const jiraLinks = [];

            for (let ticket of tickets) {
                try {
                    console.log("Creating Jira ticket with the following details:");
                    console.log("Epic Key:", epicKey);
                    console.log("Ticket Summary:", ticket.summary);
                    console.log("Description:", ticket.description);
                    console.log("Project Key:", jiraProject);

                    // Call the frontend function to create the Jira ticket (Function A)
                    const ticketKey = await createJiraTicketInEpic(epicKey, ticket.summary, ticket.description, jiraProject);
            
                    if (ticketKey) {
                        console.log(`Ticket created successfully: ${ticketKey}`);
                        jiraLinks.push(`<a href="https://jenys.atlassian.net/browse/${ticketKey}">${ticketKey}</a>`);
                    } else {
                        console.error(`Failed to create ticket for: ${ticket.summary}`);
                    }

                } catch (error) {
                    console.error(`Error creating ticket for ${ticket.summary}:`, error);
                }
            }
            return jiraLinks;  // Return the created ticket links
        }

        // Call processTickets after defining it
        const jiraLinks = await processTickets(tickets, epicKey, jiraProject);

        
        // Step 5: Update the Confluence page with Jira ticket links
        console.log("Updating Confluence page with Jira ticket links...");
        console.log("Ticket Summary:", userInput);
        console.log("Ticket Summary:", jiraLinks);
        await updateConfluencePageWithJiraLinks(userInput, jiraLinks);

        responseDiv.innerHTML = `Jira tickets created and Confluence page updated. <br> <a style="color:#ff7352;" href="${userInput}">View updated Confluence page</a>`;

    } catch (error) {
        responseDiv.innerHTML = `<strong>Error:</strong> ${error.message}`;
        console.error("Error in processConfluencePage function:", error);
    }
}

// Frontend function that calls the backend to get the Confluence page content
async function getConfluencePageContent(pageUrl) {
    try {
        // Call the backend API to fetch the Confluence page content
        const response = await fetch('http://localhost:3000/get-confluence-page', {
            method: 'POST',
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ pageUrl })  // Send the page URL to the backend
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Confluence page from backend. Status: ${response.status}`);
        }

        const { content, title, jiraProject } = await response.json();
        console.log(`Confluence page title: ${title}, Project: ${jiraProject}`);
        return { content, title, jiraProject };

    } catch (error) {
        console.error("Error fetching Confluence page content from backend:", error);
        throw error;
    }
}

/*
async function getConfluencePageContent(pageUrl) {
    const confluence_url = 'https://jenys.atlassian.net'; // Replace with your Confluence domain
    const confluence_email = 'zhenya.stoeva@gmail.com'; // Your Confluence email
    const confluence_api_token = 'ATATT3xFfGF0t6c-C1NhKZvD_R-rKPI6jh88MDoWqJXanotkbu45D8e0DgcLfb80LFfvvXA9hl2eBFYGizq8HfxXuw9E5KEc8BzJj1EpW4zYjXWgsjbC7eg8P7dp5oU6wyDCQMsRh3GN5Uz7iGw2yajFCgWNlEwbO1UlqRylAvxxPNMw-zfpCcQ=8F922A1F'; // Your Confluence API token

    try {
        const authHeader = `Basic ${btoa(`${confluence_email}:${confluence_api_token}`)}`;
        
        // Extract the page ID from the URL
        const pageIdMatch = pageUrl.match(/\/pages\/(\d+)\//);
        if (!pageIdMatch || !pageIdMatch[1]) {
            throw new Error("Page ID not found in URL");
        }
        const pageId = pageIdMatch[1];  // Extract the page ID, e.g., 81264641

        // Fetch the Confluence page content
        const response = await fetch(`${confluence_url}/wiki/rest/api/content/${pageId}?expand=body.storage`, {
            method: 'GET',
            headers: {
                "Authorization": authHeader,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch page from Confluence. Status: ${response.status}`);
        }

        const pageData = await response.json();
        const content = pageData.body.storage.value;
        const title = pageData.title;
        const jiraProject = extractProjectFromContent(content); // Assuming the project key is embedded in the content
        console.log(`Confluence page title: ${title}, Project: ${jiraProject}`);
        return { content, title, jiraProject };

    } catch (error) {
        console.error("Error fetching Confluence page content:", error);
        throw error;
    }
}
*/

// Helper function to extract the project key from Confluence page content
function extractProjectFromContent(content) {
    // Implement logic to extract Jira project name/key from the page content
    const projectMatch = content.match(/Project:\s*([A-Z]+)\b/); // Assuming "Project: <key>" is mentioned in the content
    if (projectMatch && projectMatch[1]) {
        return projectMatch[1];
    }
    throw new Error("Jira project key not found in Confluence content");
}

/*
async function breakDownContent(content) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer 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`
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

    // Ensure the response is properly structured and parse the content
    if (responseData.choices && responseData.choices.length > 0) {
        const tasksText = responseData.choices[0].message.content;
        console.log("Tasks extracted from content:", tasksText);

        // Parse the tasks into structured summary and description
        const tickets = parseTasksToTickets(tasksText);
        console.log("Parsed Tickets:", tickets);
        return tickets;  // Return an array of objects with { summary, description }
    } else {
        throw new Error("Failed to extract tasks from content.");
    }
}
*/

// Frontend: Calls the backend to break down the content using OpenAI API
async function breakDownContent(content) {
    try {
        const response = await fetch('http://localhost:3000/break-down-content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content })  // Send the Confluence content to the backend
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Error breaking down content:", data);
            return null;
        }

        const tasksText = data.tasksText;
        console.log("Tasks extracted from content:", tasksText);

        // Parse the tasks into structured summary and description
        const tickets = parseTasksToTickets(tasksText);
        console.log("Parsed Tickets:", tickets);
        return tickets;  // Return an array of objects with { summary, description }
        
    } catch (error) {
        console.error("Error in breakDownContent:", error);
        throw error;
    }
}


function parseTasksToTickets(tasksText) {
    const tickets = [];

    // Use a different approach to split the tasks if "Ticket X:" pattern isn't reliable
    const taskBlocks = tasksText.split(/\n\n+/g).filter(Boolean);  // Split by double newlines (or more)

    taskBlocks.forEach((block, index) => {
        // Trim each block to remove unnecessary spaces/newlines
        const trimmedBlock = block.trim();

        // Extract summary and description
        const summaryMatch = trimmedBlock.match(/Summary:\s*(.*?)(\n|$)/);  // Extract summary after "Summary:"
        const summary = summaryMatch ? summaryMatch[1].trim() : `Untitled Ticket ${index + 1}`;

        const descriptionMatch = trimmedBlock.match(/Description:\s*(.*)/s);  // Extract description after "Description:"
        const description = descriptionMatch ? descriptionMatch[1].trim() : "No description";

        tickets.push({
            summary,
            description
        });
    });

    return tickets;  // Return the array of tickets starting from index 0
}

async function createJiraEpicIfNotExists(epicTitle, projectKey) {
    const response = await fetch('http://localhost:3000/check-epic', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            epicTitle: epicTitle,
            projectKey: projectKey
        })
    });

    const data = await response.json();
    if (!response.ok) {
        console.error("Error checking Epic:", data);
        return null;
    }
    return data.key;  // If Epic exists or is created
}



async function createJiraTicketInEpic(epicKey, ticketSummary, description, projectKey) {
    try {
        console.log("Creating Jira ticket with the following details:");
        console.log("Epic Key:", epicKey);
        console.log("Ticket Summary:", ticketSummary);
        console.log("Description:", description);
        console.log("Project Key:", projectKey);

        // Making the request to your backend or Jira server
        const response = await fetch('http://localhost:3000/create-ticket', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                epicKey: epicKey,
                ticketSummary: ticketSummary,
                description: description,
                projectKey: projectKey
            })
        });

        const responseText = await response.text();  // Capture full response text
        console.log("Response Text:", responseText);

        if (!response.ok) {
            console.error("Error creating Jira ticket. Status:", response.status);
            console.error("Response Data:", responseText);  // Log the full response for debugging
            return null;
        }

        // Parse the response if the request was successful
        const data = JSON.parse(responseText);  // In case the response is not JSON-parsed automatically
        console.log("Ticket created successfully. Jira Ticket Key:", data.key);
        return data.key;

    } catch (error) {
        console.error("Error occurred in createJiraTicketInEpic:", error);
        return null;
    }
}

async function updateConfluencePageWithJiraLinks(pageUrl, jiraLinks) {
    try {
        // Prepare the payload to send to the backend
        const payload = {
            pageUrl: pageUrl,
            jiraLinks: jiraLinks
        };

        // Send request to the backend to update the Confluence page
        const response = await fetch('http://localhost:3000/update-confluence-page', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(`Failed to update Confluence page. Error: ${responseData.error}`);
        }

        console.log("Confluence page updated successfully on the backend.");
    } catch (error) {
        console.error("Error in updateConfluencePageWithJiraLinks:", error);
        throw error;
    }
}