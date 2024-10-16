// Embeddings store to store Jira ticket embeddings
let embeddingsStore = {}; 
let issuesStore = {}; // Store detailed issue information for translation back to natural language

// Main function to handle user input
// export async function sendQuestion() {
//     const question = document.getElementById("userInput").value;
//     const responseDiv = document.getElementById("response");

//     responseDiv.innerHTML = "Processing your request...";

//     try {
//         // 1. Create embedding for the user's query
//         const queryEmbedding = await createEmbedding(question);

//         // Call connectToJira to fetch data and generate embeddings on page load
//         await connectToJira();

//         // 2. Find all relevant Jira tickets based on the query embedding
//         const relevantTicketIds = findAllRelevantJiraTickets(queryEmbedding);

//         // 3. Retrieve the detailed information of all relevant Jira tickets and combine them
//         let combinedTicketDetails = '';
//         let embeddingUsed = false;

//         relevantTicketIds.forEach(ticketId => {
//             const details = issuesStore[ticketId];
//             combinedTicketDetails += `
//                 <strong>Ticket ID:</strong> ${ticketId}<br>
//                 <strong>Summary:</strong> ${details.summary}<br>
//                 <strong>Description:</strong> ${details.description}<br>
//                 <strong>Labels:</strong> ${details.labels}<br>
//                 <strong>Impact:</strong> ${details.impact}<br>
//                 <br>---------------------------------------<br>
//             `;

//             embeddingUsed = true; // Mark that embedding information is available

//         });

//         // 4. Construct the reasoning prompt using information from all tickets
//         const reasoningPrompt = `
//             Hi Jeny, I found these tickets relevant to your prompt:<br>
//             ${combinedTicketDetails}

//             <br>and I used them to answer you question:
//             ${question}
//         `;

//         // Adjust reasoningPrompt if no embeddings were actually used
//         if (!embeddingUsed) {
//             reasoningPrompt = `
//                 Hi Jeny, I did not find any relevant ticket information to include. Answering your question based on general knowledge:
//                 ${question}
//             `;
//         }

//         // 5. Send the constructed prompt to the backend to get response from OpenAI
//         const openAIResponse = await fetch("http://localhost:3000/get-openai-response", {
//             method: "POST",
//             headers: {
//                 "Content-Type": "application/json"
//             },
//             body: JSON.stringify({ reasoningPrompt })
//         });

//         const openAIData = await openAIResponse.json();

//         // Check if the request was successful
//         if (!openAIResponse.ok) {
//             responseDiv.innerHTML = `<strong>Error:</strong> Failed to fetch the response from backend!<br><strong>Details:</strong> ${JSON.stringify(openAIData, null, 2)}`;
//             console.error("Error details:", openAIData);
//             return;
//         }

//         // Display the final prompt and the OpenAI response
//         responseDiv.innerHTML = `
//             <strong style="color:#FEB7C7;">Final Prompt (user prompt & data from the model embeddings):</strong><br>
//             ${reasoningPrompt}<br><br>
//             <strong style="color:#FEB7C7;">Model Response:</strong><br> ${openAIData.content}
//         `;

//         // If embedding was used, print the combined ticket details
//         if (embeddingUsed) {
//             console.log("Embedded Information Used:");
//             console.log(combinedTicketDetails);
//         }

//     } catch (error) {
//         responseDiv.innerHTML = `<strong>Error:</strong> ${error.message}`;
//         console.error("Error in askJPDQuestionWorkflow.js: ", error);
//     }
// }

export async function sendQuestion() {
    const question = document.getElementById("userInput").value;
    const responseDiv = document.getElementById("response");

    responseDiv.innerHTML = "Processing your request...";

    try {
        // 1. Create embedding for the user's query
        const queryEmbedding = await createEmbedding(question);

        // Call connectToJira to fetch data and generate embeddings on page load
        // await connectToJira();

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

            <br>Please answer the following question using the provided information where relevant. If you do not use any of the ticket information, clearly state that it was not relevant:
            ${question}
        `;

        // 5. Send the constructed prompt to the backend to get response from OpenAI
        const openAIResponse = await fetch("http://localhost:3000/get-openai-response", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ reasoningPrompt })
        });

        const openAIData = await openAIResponse.json();

        // Check if the request was successful
        if (!openAIResponse.ok) {
            responseDiv.innerHTML = `<strong>Error:</strong> Failed to fetch the response from backend!<br><strong>Details:</strong> ${JSON.stringify(openAIData, null, 2)}`;
            console.error("Error details:", openAIData);
            return;
        }

        const modelResponse = openAIData.content;

        // Update the UI with model response
        const formattedModelResponse = modelResponse.replace(/\n/g, '<br>');
        

        // Display the final output conditionally
        let outputHtml = `
            <strong style="color:#FEB7C7;">Model Response:</strong><br> ${formattedModelResponse}
        `;

        outputHtml = `
                <strong style="color:#FEB7C7;">Final Prompt (user prompt & data from the model embeddings):</strong><br>
                ${reasoningPrompt}<br><br>
                <strong style="color:#FEB7C7;">Model Response:</strong><br> ${formattedModelResponse}
            `;

            // Print the embedded information used in the console
            console.log("Embedded Information Used:");
            console.log(combinedTicketDetails);
        

        // Update the UI
        responseDiv.innerHTML = outputHtml;

    } catch (error) {
        responseDiv.innerHTML = `<strong>Error:</strong> ${error.message}`;
        console.error("Error in askJPDQuestionWorkflow.js: ", error);
    }
}


async function connectToJira() {
    const projectKey = 'SUN'; // Jira project key

    try {
        console.log("Attempting to fetch issues from backend...");

        const response = await fetch("http://localhost:3000/fetch-jira-issues", {
            method: 'POST',
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ projectKey })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch issues from backend');
        }

        // Process the issues fetched from backend
        const issuesDiv = document.getElementById('jiraIssues');
        issuesDiv.innerHTML = ''; // Clear previous content

        for (const issue of data.issues) {
            // Log all fields of the issue to the console
            console.log("Full issue fields:", issue.fields);

            const issueKey = issue.key;
            const summary = issue.fields.summary;
            const description = issue.fields.description || "No description available";
            const labels = issue.fields.labels.join(", ") || "No labels";
            const impact = issue.fields.customfield_10077 || "No impact";

            issuesStore[issueKey] = { summary, description, labels, impact };

            // Create embedding and store it
            const textForEmbedding = `${summary} ${description}`;
            const embedding = await createEmbedding(textForEmbedding);
            embeddingsStore[issueKey] = embedding;
        }

        console.log("Issues processed successfully");

    } catch (error) {
        console.error("Error:", error.message);
        document.getElementById('jiraIssues').innerHTML = `<strong>Error:</strong> ${error.message}`;
    }
}


// Frontend function to send text to the backend
async function createEmbedding(text) {
    try {
        const response = await fetch("http://localhost:3000/create-embedding", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ text })
        });

        const data = await response.json();

        if (response.ok) {
            return data.embedding;
        } else {
            console.error("Error from backend:", data.error);
        }
    } catch (error) {
        console.error("Error communicating with backend:", error);
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


// // Call connectToJira to fetch data and generate embeddings on page load
connectToJira();