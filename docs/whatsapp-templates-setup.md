# WhatsApp Message Templates Setup Guide

## Prerequisites

- Meta Business Manager account
- WhatsApp Business API access via Twilio
- Admin access to your WhatsApp Business phone number

## Template 1: Confirm Work Log (Reply Buttons)

### Step-by-Step Creation

1. **Navigate to Templates**
   - Go to [Meta Business Manager](https://business.facebook.com/)
   - Select your WhatsApp Business account
   - Click "Message Templates" in left sidebar
   - Click "Create Template"

2. **Template Configuration**
   - **Name**: `confirm_work_log`
   - **Category**: Select "UTILITY" (not MARKETING)
   - **Languages**: English

3. **Header** (Optional)
   - Skip or add: "✅ Confirm Your Work"

4. **Body** (Required)
   ```
   You logged {{1}} for {{2}} hours at {{3}}. Is this correct?
   ```
   - Variables:
     - `{{1}}` = Work type (e.g., "electrical")
     - `{{2}}` = Hours worked (e.g., "4")
     - `{{3}}` = Project name (e.g., "City Mall Project")

5. **Footer** (Optional)
   - Skip this

6. **Buttons**
   - Click "Add buttons" → Select "Quick reply buttons"
   - Button 1: `✅ Yes, submit it`
   - Button 2: `❌ No, let me correct`
   - **Max 3 buttons allowed**

7. **Submit**
   - Review preview
   - Click "Submit"
   - Wait 24-48 hours for Meta approval

---

## Template 2: Select Project (List Message)

### Step-by-Step Creation

1. **Create New Template**
   - **Name**: `select_project`
   - **Category**: "UTILITY"
   - **Languages**: English

2. **Body**
   ```
   You logged {{1}} for {{2}} hours.

   Please select which project:
   ```
   - Variables:
     - `{{1}}` = Work type
     - `{{2}}` = Hours worked

3. **Buttons**
   - Click "Add buttons" → Select "Call to action"
   - Button type: "List message"
   - Button text: `📋 Select Project`

   **List Sections** (you'll populate dynamically via API):
   - Section 1 title: "Your Projects"
   - Items will be added via Twilio API (up to 10 items)

4. **Submit for Approval**

---

## Template 3: Confirm Project (Reply Buttons)

### Optional - For final confirmation

1. **Name**: `confirm_project`
2. **Category**: "UTILITY"
3. **Body**:
   ```
   You logged {{1}} for {{2}} hours.

   At project {{3}}?
   ```
4. **Buttons**:
   - `✅ Yes`
   - `❌ No`

---

## Multi-Language Support (English + Spanish)

WhatsApp templates must be created separately for each language. You'll need to
create **duplicate templates** with Spanish content.

### Spanish Template 1: confirm_work_log_es

1. **Name**: `confirm_work_log_es`
2. **Category**: "UTILITY"
3. **Language**: **Spanish**
4. **Body**:
   ```
   Registraste {{1}} por {{2}} horas en {{3}}. ¿Es correcto?
   ```
5. **Buttons**:
   - `✅ Sí, enviar`
   - `❌ No, corregir`

### Spanish Template 2: select_project_es

1. **Name**: `select_project_es`
2. **Category**: "UTILITY"
3. **Language**: **Spanish**
4. **Body**:
   ```
   Registraste {{1}} por {{2}} horas.

   Selecciona tu proyecto:
   ```
5. **List Button** (if available):
   - `📋 Proyectos`
   - **Note**: If list button not available, system falls back to numbered text
     list automatically

### Spanish Template 3: confirm_project_es

1. **Name**: `confirm_project_es`
2. **Body**:
   ```
   Registraste {{1}} por {{2}} horas.

   ¿En proyecto {{3}}?
   ```
3. **Buttons**: `✅ Sí` / `❌ No`

### Environment Variables for Both Languages

```env
# English templates
WHATSAPP_TEMPLATE_CONFIRM_ALL_EN=HXxxxxxxxxxxxxx
WHATSAPP_TEMPLATE_SELECT_PROJECT_EN=HXxxxxxxxxxxxxx

# Spanish templates  
WHATSAPP_TEMPLATE_CONFIRM_ALL_ES=HXxxxxxxxxxxxxx
WHATSAPP_TEMPLATE_SELECT_PROJECT_ES=HXxxxxxxxxxxxxx
```

**How it works:**

- System detects user's language from their messages (already working)
- Selects appropriate template SID based on language
- Sends interactive message in user's language

---

## After Approval

Once templates are approved (check email for Meta notification):

1. **Note the Template SIDs**
   - Each approved template gets a unique SID from Twilio
   - Format: `HX...` (Content SID)

2. **Get Template SIDs from Twilio**
   ```bash
   curl -X GET 'https://content.twilio.com/v1/Content' \
     -u YOUR_ACCOUNT_SID:YOUR_AUTH_TOKEN
   ```

3. **Add to Environment Variables**
   ```env
   WHATSAPP_TEMPLATE_CONFIRM_ALL=HXxxxxxxxxxxxxx
   WHATSAPP_TEMPLATE_SELECT_PROJECT=HXxxxxxxxxxxxxx
   WHATSAPP_TEMPLATE_CONFIRM_PROJECT=HXxxxxxxxxxxxxx
   ```

---

## Testing Templates

Before going live, test with Twilio's sandbox:

```bash
# Send test message with template
curl -X POST https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID/Messages.json \
  -u YOUR_ACCOUNT_SID:YOUR_AUTH_TOKEN \
  -d "From=whatsapp:+14155238886" \
  -d "To=whatsapp:+YOUR_TEST_NUMBER" \
  -d "ContentSid=HXxxxxx" \
  -d "ContentVariables={\"1\":\"electrical\",\"2\":\"4\",\"3\":\"City Mall\"}"
```

---

## Troubleshooting

**Template Rejected?**

- Meta rejects templates with:
  - Marketing language in UTILITY templates
  - Personalized greetings ("Hey John")
  - Promotional content

**Solution**: Keep templates generic, factual, and transactional

**Can't see interactive buttons?**

- WhatsApp only shows interactive messages to WhatsApp users
- Test with real WhatsApp number, not SMS

**24-hour window expired?**

- Can't send templates without user initiating conversation
- User must message you first within 24 hours
- OR use a template to restart conversation (costs more)

---

## Next Steps

After templates are approved:

1. Share the template names/SIDs with me
2. I'll integrate them into the Twilio service
3. We'll update the state machine to use interactive messages
4. Test the full flow!
