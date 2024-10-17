export async function processConfluencePage(userInput) {
    const responseDiv = document.getElementById("response");
    responseDiv.innerHTML = "Processing the Confluence page...";

    try {
        // Step 1: Fetch Confluence page content and extract the Jira project
        console.log("Fetching Confluence page content...");
        const { content, title, jiraProject } = await getConfluencePageContent(userInput);

        // Step 2: Breaking down Confluence page content into granular tasks
        console.log("Breaking down content into granular tasks...");
        // Await the response from breakDownContent
        const tickets = await breakDownContent(content);
        console.log("Tickets generated:", tickets);

        
        // // Debugging: Log the tickets array
        // console.log("Tickets array:", tickets);
        // console.log("Number of tickets:", tickets.length);

        // // If no tickets are found, exit
        // if (!tickets || tickets.length === 0) {
        //     console.error("No tickets to process.");
        //     responseDiv.innerHTML = "No tasks found to create Jira tickets.";
        //     return;
        // }

        // Step 3: Check if Epic already exists in the Jira project
        console.log(`Checking if Epic '${title}' exists in project '${jiraProject}'...`);
        const epicResult = await processEpic(title, jiraProject);

        // Check if the epic already exists and stop the flow
        if (epicResult.message.includes("already exists")) {
            responseDiv.innerHTML = `Epic with the same name already exists: ${epicResult.key}`; //key 
            return;  // Stop further processing
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
        const jiraLinks = await processTickets(tickets, epicResult.key, jiraProject);

        // Step 5: Update the Confluence page with created Epic
        await updateConfluencePageWithEpicLink(userInput, epicResult.key);

        //print Confluence page structure
        // await getConfluencePage(userInput);


        responseDiv.innerHTML = `Jira tickets created and Confluence page updated. <br> <a style="color:#FEB7C7;" href="${userInput}">View updated Confluence page</a>`;

    } catch (error) {
        responseDiv.innerHTML = `<strong>Error:</strong> ${error.message}`;
        console.error("Error in processConfluencePage.js: ", error);
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


// break down the content using OpenAI API
async function breakDownContent(content) {
    try {
        // Send request to the backend with content and customizable description structure
        const response = await fetch('http://localhost:3000/break-down-content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content })  // Send content and structure to the backend descriptionStructure
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

// Helper function to parse the tasks into summary and description
function parseTasksToTickets(tasksText) {
    const tickets = [];
    
    // Regex pattern to match each ticket starting with "Summary" and capturing both "Summary" and "Description"
    const ticketPattern = /Summary:\s*(.*?)\n\s*Description:\s*([\s\S]*?)(?=(\n\s*Summary|$))/g;
    
    let match;
    while ((match = ticketPattern.exec(tasksText)) !== null) {
        const summary = match[1].trim();
        let description = match[2].trim();

        // Add a new line before "Requirements" so it doesn't stick to "Goal"
        description = description
            .replace(/\n\s*(?=Goal)/g, '\n\n')  // Ensure a new line before "Goal"
            .replace(/\n\s*(?=Requirements)/g, '\n\n');  // Ensure a new line before "Requirements"

        tickets.push({
            summary,
            description,
        });
    }

    return tickets;
}
  

// Function to check if the Epic exists
async function checkEpic(epicTitle, projectKey) {
    const response = await fetch('http://localhost:3000/check-epic', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ epicTitle, projectKey })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Failed to check Epic');
    }

    return data;  // Returns the epic data or message
}

// Function to create a new Jira Epic if it doesn't exist
async function createEpic(epicTitle, projectKey) {
    const response = await fetch('http://localhost:3000/create-epic', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ epicTitle, projectKey })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Failed to create Epic');
    }

    // Ensure that only the key (not the entire object) is returned
    return data.key;  // This should return the Epic's key directly as a string
}

async function processEpic(epicTitle, projectKey) {
    try {
        const epicData = await checkEpic(epicTitle, projectKey);

        if (epicData.message === "Epic already exists") {
            console.log(`Epic for "${epicTitle}" already exists!`);
            return { message: `Epic for "${epicTitle}" already exists!`, key: epicData.key };
        }

        // If the Epic does not exist, create a new one
        const newEpicKey = await createEpic(epicTitle, projectKey);
        console.log(`New Epic created with key: ${newEpicKey}`);
        return { message: `New Epic created with key: ${newEpicKey}`, key: newEpicKey };

    } catch (error) {
        console.error("Error processing Epic:", error.message);
        return { message: "An error occurred while processing the Epic.", error: error.message };
    }
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