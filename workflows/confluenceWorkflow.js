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

        
        // // OLD Step 5: Update the Confluence page with Jira ticket links
        // console.log("Updating Confluence page with Jira ticket links...");
        // console.log("Ticket Summary:", userInput);
        // console.log("Ticket Summary:", jiraLinks);
        // await updateConfluencePageWithJiraLinks(userInput, jiraLinks);

        // Step 5: Update the Confluence page with created Epic
        await updateConfluencePageWithEpicLink(userInput, epicKey);

        //print Confluence page structure
        // await getConfluencePage(userInput);


        responseDiv.innerHTML = `Jira tickets created and Confluence page updated. <br> <a style="color:#ff7352;" href="${userInput}">View updated Confluence page</a>`;

    } catch (error) {
        responseDiv.innerHTML = `<strong>Error:</strong> ${error.message}`;
        console.error("Error in processConfluencePage function:", error);
    }
}

//Printing confluence page
async function getConfluencePage(pageUrl) {
    try {
        const response = await fetch('http://localhost:3000/get-confluence-page-print', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ pageUrl })
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Confluence page. Status: ${response.status}`);
        }

        const data = await response.json();
        
        // Log each content format
        console.log("Storage Content:", data.storageContent);
        console.log("Editor Content:", data.editorContent);
        console.log("View Content:", data.viewContent);
    } catch (error) {
        console.error("Error fetching Confluence page:", error);
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


// Helper function to extract the project key from Confluence page content
function extractProjectFromContent(content) {
    // Implement logic to extract Jira project name/key from the page content
    const projectMatch = content.match(/Project:\s*([A-Z]+)\b/); // Assuming "Project: <key>" is mentioned in the content
    if (projectMatch && projectMatch[1]) {
        return projectMatch[1];
    }
    throw new Error("Jira project key not found in Confluence content");
}


// // break down the content using OpenAI API
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

async function updateConfluencePageWithEpicLink(pageUrl, epicKey) {
    try {
        // Prepare the payload to send to the backend
        const payload = {
            pageUrl: pageUrl,
            epicKey: epicKey
        };

        // Send request to the backend to update the Confluence page with the epic link
        const response = await fetch('http://localhost:3000/update-confluence-page-with-epic', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(`Failed to update Confluence page with Epic link. Error: ${responseData.error}`);
        }

        console.log("Confluence page updated with Epic link successfully.");
    } catch (error) {
        console.error("Error in updateConfluencePageWithEpicLink:", error);
        throw error;
    }
}