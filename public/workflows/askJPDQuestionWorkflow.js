// Embeddings store to store Jira ticket embeddings
let embeddingsStore = {}; 
let issuesStore = {}; // Store detailed issue information for translation back to natural language

// Main function to handle user input
export async function sendQuestion() {
    const question = document.getElementById("userInput").value;
    const responseDiv = document.getElementById("response");

    responseDiv.innerHTML = "Processing your request...";

    try {
        // 1. Create embedding for the user's query
        const queryEmbedding = await createEmbedding(question);

        // 2. Find all relevant Jira tickets based on the query embedding
        const relevantTicketIds = findAllRelevantJiraTickets(queryEmbedding);

        // 3. Retrieve the detailed information of all relevant Jira tickets and combine them
        let combinedTicketDetails = '';
        relevantTicketIds.forEach(ticketId => {
            const details = issuesStore[ticketId];
            combinedTicketDetails += `
                <strong>Ticket ID:</strong> ${ticketId}<br>
                <strong>Summary:</strong> ${details.summary}<br>
                <strong>Description:</strong> ${details.description}<br>
                <strong>Labels:</strong> ${details.labels}<br>
                <strong>Impact:</strong> ${details.impact}<br>
                <br>---------------------------------------<br>
            `;
        });

        // 4. Construct the reasoning prompt using information from all tickets
        const reasoningPrompt = `
            Hi Jeny, I found these tickets relevant to your prompt:<br>
            ${combinedTicketDetails}

            <br>and I used them to answer you question:
            ${question}
        `;

        // 5. Send the constructed prompt to OpenAI for reasoning
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer `
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: reasoningPrompt }],
                max_tokens: 300,
                temperature: 0.7
            })
        });

        const responseData = await response.json();

        // Check if the request was successful
        if (!response.ok) {
            responseDiv.innerHTML = `<strong>Error:</strong> Failed to fetch the response from OpenAI!<br><strong>Full Response:</strong> ${JSON.stringify(responseData, null, 2)}`;
            console.error("Error details:", responseData);
            return;
        }

        // Display the final prompt and the OpenAI response
        responseDiv.innerHTML = `
            <strong style="color:#f873d0;">Final Prompt (user prompt & data from the model embeddings):</strong><br>
            ${reasoningPrompt}<br><br>
            <strong style="color:#f873d0;">Model Response:</strong><br> ${responseData.choices[0].message.content}
        `;

    } catch (error) {
        responseDiv.innerHTML = `<strong>Error:</strong> ${error.message}`;
    }
}

// Function to connect to Jira and create embeddings for each ticket
async function connectToJira() {
    const jira_url = ''; // Replace with your Jira domain
    const jira_email = ''; // Your Jira email
    const jira_api_token = ''; // Your Jira API token
    const project_key = 'SUN'; // Your project key

    try {
        console.log("Attempting to connect to Jira...");

        // Jira API fetch options
        const authHeader = `Basic ${btoa(`${jira_email}:${jira_api_token}`)}`;

        // Fetch all issues in the project
        const jqlQuery = `project=${project_key}`;
        const issuesResponse = await fetch(`${jira_url}/rest/api/2/search?jql=${encodeURIComponent(jqlQuery)}`, {
            method: 'GET',
            headers: {
                "Authorization": authHeader,
                "Content-Type": "application/json"
            }
        });

        if (!issuesResponse.ok) {
            throw new Error(`Failed to fetch issues from Jira. Status: ${issuesResponse.status}`);
        }

        const issuesData = await issuesResponse.json();

        const issuesDiv = document.getElementById('jiraIssues');
        issuesDiv.innerHTML = ''; // Clear previous content

        // Extract and store information for each issue
        for (const issue of issuesData.issues) {
            const issue_key = issue.key;  // Jira ticket number
            const summary = issue.fields.summary;
            const description = issue.fields.description || "No description available";
            const labels = issue.fields.labels.join(", ") || "No labels";
            const impact = issue.fields.customfield_10077 || "No impact";

            // Store detailed information for reasoning later
            issuesStore[issue_key] = { summary, description, labels, impact };

            // Create an embedding for the summary + description
            const text_for_embedding = `${summary} ${description}`;
            const embedding = await createEmbedding(text_for_embedding);
            embeddingsStore[issue_key] = embedding;

            // Output the information to the web page
            /*const issueElement = document.createElement('div');
            issueElement.classList.add('issue');
            issueElement.innerHTML = `
                <strong>Issue:</strong> ${issue_key} <br>
                <strong>Summary:</strong> ${summary} <br>
                <strong>Description:</strong> ${description} <br>
                <strong>Labels:</strong> ${labels} <br>
                <strong>Impact:</strong> ${impact} <br>
                <hr>
            `;
            issuesDiv.appendChild(issueElement);*/
        }

    } catch (error) {
        console.error("Error:", error.message);
        document.getElementById('jiraIssues').innerHTML = `<strong>Error:</strong> ${error.message}`;
    }
}

// Function to create embeddings for the user's prompt
async function createEmbedding(text) {
    try {
        const response = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer `
            },
            body: JSON.stringify({
                model: "text-embedding-ada-002",
                input: text
            })
        });
        const data = await response.json();
        return data.data[0].embedding;
    } catch (error) {
        console.error("Error creating embedding:", error);
    }
}

// Cosine similarity function to compare embeddings
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

// Function to find all relevant Jira tickets based on the user query
function findAllRelevantJiraTickets(queryEmbedding) {
    const similarities = [];

    for (const [ticketId, ticketEmbedding] of Object.entries(embeddingsStore)) {
        const similarity = cosineSimilarity(queryEmbedding, ticketEmbedding);
        similarities.push({ ticketId, similarity });
    }

    // Sort by similarity and return all relevant results
    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.map(result => result.ticketId); // Return all ticket IDs
}

// Call connectToJira to fetch data and generate embeddings on page load
//connectToJira();