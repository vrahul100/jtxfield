---
description: How to deploy the JTX Field application to Vercel
---

# Deploy to Vercel

1.  **Install Vercel CLI** (if not already installed)
    ```bash
    npm install -g vercel
    ```

2.  **Login to Vercel**
    ```bash
    vercel login
    ```

3.  **Link Project**
    Run this command in the project root to link your local project to a Vercel project.
    ```bash
    vercel link
    ```

4.  **Set Environment Variables**
    You need to set the following environment variables in your Vercel project settings (or via CLI):
    *   `DATABASE_URL`: Your Supabase connection string (transaction pooler recommended, port 6543).
    *   `Direct_URL`: Your Supabase session connection string (port 5432) - *required for migrations if running from Vercel, though we usually migrate locally*.
    *   `SUPABASE_URL`: Your Supabase URL.
    *   `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase Service Role Key.
    *   `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token.
    *   `GROQ_API_KEY`: Your Groq API Key.
    *   `NODE_ENV`: `production`

    To add them via CLI:
    ```bash
    vercel env add DATABASE_URL
    # ... repeat for others
    ```

5.  **Deploy**
    *   **Preview Deployment**:
        ```bash
        vercel
        ```
    *   **Production Deployment**:
        ```bash
        vercel --prod
        ```

## Notes
- The `vercel.json` file handles the configuration to route requests to the Hono app.
- Ensure your database migrations (`npm run db:migrate`) are applied to the production database.
Twilio Configuration Guide
Phone Number Settings:
Go to Phone Numbers > Manage > Active Numbers.
Click on your JTX Field phone number.
Messaging Configuration:
Scroll down to the Messaging section.
Configure with: "Webhooks, TwiML Bins, Functions, Studio, or Proxy".
A MESSAGE COMES IN:
Webhook: https://<your-vercel-project-name>.vercel.app/twhook
HTTP Method: POST
WhatsApp (if using Sandbox):
Go to Messaging > Try it out > Send a WhatsApp message.
Sandbox Settings:
When a message comes in: https://<your-vercel-project-name>.vercel.app/twhook
Method: POST
Important: Ensure your Vercel project has the TWILIO_AUTH_TOKEN environment variable set, as the code uses this to validate that the request is genuinely from Twilio.