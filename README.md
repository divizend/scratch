# Scratch for Business Process Automation

## Short links

- [Admin interface](/admin)

## Introduction

Scratch is the visual programming language with which I also learnt programming when I was around 10. When you go to https://scratch.divizend.ai/admin (or click on "Admin interface"), first send an access token to your email. It'll look like this:

![]

Of course the actual point of this all is not Scratch itself, but to harmonize the systems we're interacting with within our organization through their APIs. Therefore the background of the Scratch layer on the surface is this repo (every block is actually just an API call). It should initiate the harmonization of all the APIs of the systems that constitute any organization in a language "as simple as child's play", i.e. Scratch blocks. My next experiment will be to transfer all business logic into communication on streams, to embrace the event-driven paradigm more and increase reliability and efficiency of the system, so let me know in case you'd like to participate in the more technical details here, by sending 

This means that the goal is a conscious simplification, always with an API-first focus on the inside. Scratch should always be a "playground" for all your automation needs, but any blocks can be added in "regular" code quickly, and therefore be rolled out to everyone in the company. Adding blocks simply happens here in the GitHub repo, and should, over time, become a frequent process until all our operations are cleanly covered. So in case you see yourself frequently reuse functionality, please let me know.

Therefore, please save your projects and reload the Scratch editor page from time to time, to always be up to date with the newest features. The URL passed to the Scratch editor UI stays the same across any updates. So with that said: Build!

## Usage

The code from this website can be run by visiting the [admin interface](/admin) and clicking on "Open in Scratch".

The web server defined in this repository ([github.com/divizend/scratch](https://github.com/divizend/scratch)) is currently deployed at [scratch.divizend.ai](https://scratch.divizend.ai).

## Local setup

1. `cp .env.example .env`
2. Update the different secrets in your `.env`. Follow the instructions below to set up the integration with Google Workspace.
3. Run `bun install`
4. Run `bun run dev`
5. Visit http://localhost:3000 and click on "Admin interface", send a token to your email address and enter it.
6. Click on "Open Scratch" to launch Scratch with an extension which contains the configured endpoints (see `src/server/endpoints.ts`).
7. Choose the "queue email" block from the e.g. "Divizend (Julian Nalenz)" section, try it and see how the queued email shows up in the admin interface.

## Setting up GSuite

### Making the admin user an organization admin

1. Go to https://console.cloud.google.com/iam-admin/iam
2. Make sure that not a project is selected, but instead the organization (i.e. the heading of the page should be something like `Permissions for organization "divizend.com"` and the URL should contain something like `&organizationId=475226626272`)
3. Click on "Grant access"
4. In the "New principals" field, enter the email address of the organization's admin.
5. Under "Select a role", choose `Organization Policy Administrator`.
6. Click "Save".
7. Wait a minute or so.

### Allow creating service account keys

1. Go to https://console.cloud.google.com/iam-admin/orgpolicies/list and select your API project.
2. Filter by `iam.disableServiceAccountKeyCreation`.
3. If it's currently enforced and not overridden: At the end of its row, click on the three dots > Edit policy > Overwrite policy of parent resource > Add rule > Keep "Enforcement" as off > Done > Apply policy.
4. If it's currently enforced and overridden: Remove the override.
5. Wait a minute or so.

### Create service account

1. Go to https://console.cloud.google.com/iam-admin/serviceaccounts and select your API project.
2. Click on "Create service account" on the top.
3. Call it "ai-executive", then click "Create and continue" and ignore step 2 and 3.
4. In its row, click on the three dots > Manage keys > Add key > Create new key > JSON > Create.
5. It'll download a JSON file.
6. Add a row like this to `.env` (email comes from the key `client_email` and private key from `private_key` in the JSON, then also add the email address of the workspace's admin user):

```
GCP_CLIENT_EMAIL_DIVIZEND=ai-commander@api-project-123456789.iam.gserviceaccount.com
GCP_PRIVATE_KEY_DIVIZEND="-----BEGIN PRIVATE KEY-----\nMIIEvQI...uHwU+Ag==\n-----END PRIVATE KEY-----\n"
GCP_ADMIN_USER_DIVIZEND=your.name@divizend.com
```

### Enable API scopes through domain-wide delegation

1. In the service account view (e.g. https://console.cloud.google.com/iam-admin/serviceaccounts/details/102840656400393431115?authuser=0&project=fresh-myth-440600-h9&supportedpurview=project), copy the client ID (e.g. `102840656400393431115`)
2. Go to https://admin.google.com/ac/owl/domainwidedelegation
3. Click on "Add new", enter the client ID and these OAuth scopes listed from line 117 in `src/gsuite/core/GSuite.ts`.
4. Click "Authorize"

### Enabling SDKs

1. Enable the Admin SDK API: https://console.cloud.google.com/apis/library/admin.googleapis.com?project=api-project-319594010490
2. Enable the Gmail API: https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=divizend
3. Enable the Google Docs API: https://console.developers.google.com/apis/api/docs.googleapis.com/overview?project=319594010490

## Todo

- add an interpreter for a new BASIC-like programming language which can be called like any other endpoint and which does endpoint calls as well as jumps and handling variables (goal: have a set of atomic core functionality, i.e. the main blocks, and then expressing all more high-level functionality in terms of those)
