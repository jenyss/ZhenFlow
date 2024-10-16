# ZhenFlow

Hey, you, out there... thanks for checking here!

This is a space to experiment and have fun while automating Jira and Confluence workflows and making sense of unstructured data — all powered by LLMs. Use the code at your dscretion and beware, most of it is LLM generated.

## Supported Workflows

<b>Confluence-to-Jira integration</b><br>
1. When Confluence page prompt, create Epic and Stories (in this Epic) from the Requirements section in the page.
2. Work with my Jira tickets from Confluence. Update the Confluence page with the created Epic by embedding it in expand macro.<br><br>

<b>Ask Jira Product Discovery Project a question</b><br>
Prompt a model with questions related to the Jira tickets in a JPD project of your choice.

## Intallation

### Prerequisites
Ensure you have the following installed on your system:

* Node.js (v12 or higher)
* npm (Node Package Manager)
* A GitHub account to clone the repository

### Clone the Repository
To get started, clone the repository from GitHub using the following command:

<code>git clone https://github.com/your-username/your-repository-name.git</code>

Replace your-username and your-repository-name with the actual GitHub username and repository name.

### Navigate to the Project Directory

<code>cd your-repository-name</code>

### Install Dependencies

<code>npm install</code>

### Set Up Environment Variables

In the root directory of your project, create a new file named <code>.env</code> and specify the below environment variables. 

<code>JIRA_EMAIL=your-jira-email
 JIRA_API_TOKEN=your-jira-api-token
 JIRA_URL=https://your-domain.atlassian.net
 OPENAI_TOKEN=your-openai-api-key
 PORT=3000
</code>

Make sure your .env file is included in .gitignore to prevent it from being tracked by version control and shared publicly.
In the root directory of your project, create a new file named <code>.gitignore</code> and list <code>.env</code> in it.

### Run the Project

<code>npm start</code>

The application will be available at <code>http://localhost:3000</code>

### Access the Web Interface

Open your web browser and navigate to: <code>http://localhost:3000</code>



