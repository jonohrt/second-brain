import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function findAppleReminder(title: string): Promise<boolean> {
  const escapedTitle = title.replace(/"/g, '\\"');
  const script = `tell application "Reminders"
  set matches to {}
  repeat with l in every list
    set matches to matches & (every reminder of l whose name is "${escapedTitle}" and completed is false)
  end repeat
  return (count of matches) > 0
end tell`;

  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script]);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

export async function createAppleReminder(title: string, remindAt: Date): Promise<string | null> {
  // Check for existing reminder with same name to avoid duplicates
  const exists = await findAppleReminder(title);
  if (exists) {
    console.log('[reminder] duplicate found, skipping:', title);
    return `Reminder "${title}" already exists, skipping.`;
  }

  const dateStr = remindAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = remindAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  const appleDate = `${dateStr} at ${timeStr}`;
  const escapedTitle = title.replace(/"/g, '\\"');

  const script = `tell application "Reminders"
  set defaultList to default list
  tell defaultList
    make new reminder with properties {name:"${escapedTitle}", remind me date:date "${appleDate}"}
  end tell
end tell`;

  console.log('[reminder] creating:', title, 'date:', appleDate);
  try {
    await execFileAsync('osascript', ['-e', script]);
    console.log('[reminder] created successfully:', title);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[reminder] creation failed:', message);
    return `Reminder creation failed: ${message}`;
  }
}

export interface ContactMatch {
  name: string;
  phone: string | null;
  email: string | null;
}

async function searchContacts(name: string): Promise<ContactMatch[]> {
  const escapedName = name.replace(/"/g, '\\"');
  // Search Contacts.app and return all matches with their details
  const script = `tell application "Contacts"
  launch
  delay 0.5
  set matchedPeople to (every person whose name contains "${escapedName}")
  set output to ""
  repeat with p in matchedPeople
    set pName to name of p
    set pPhone to ""
    set pEmail to ""
    if (count of phones of p) > 0 then
      set pPhone to value of phone 1 of p
    end if
    if (count of emails of p) > 0 then
      set pEmail to value of email 1 of p
    end if
    set output to output & pName & "||" & pPhone & "||" & pEmail & linefeed
  end repeat
  return output
end tell`;

  try {
    const { stdout, stderr } = await execFileAsync('osascript', ['-e', script], { timeout: 15000 });
    if (stderr) console.error('[contacts] AppleScript stderr:', stderr);
    console.log('[contacts] raw output:', JSON.stringify(stdout));
    const lines = stdout.trim().split('\n').filter(l => l.includes('||'));
    const results = lines.map(line => {
      const [contactName, phone, email] = line.split('||');
      return {
        name: contactName?.trim() ?? '',
        phone: phone?.trim() || null,
        email: email?.trim() || null,
      };
    });
    console.log('[contacts] found', results.length, 'matches for', name);
    return results;
  } catch (error) {
    console.error('[contacts] search failed:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

export async function sendIMessage(
  to: string,
  messageBody: string,
  chatService: import('./ollama-chat.js').ChatService,
): Promise<string | null> {
  // Use the LLM to determine if "to" is already a usable address or needs contact lookup
  const resolveMessages: import('./ollama-chat.js').ChatMessage[] = [
    {
      role: 'system',
      content: `You resolve message recipients. Given a recipient string, determine if it's already a phone number or email address that can be used directly, or if it's a contact name that needs lookup.

Respond with JSON only:
- If it's a direct phone number or email: { "type": "direct", "address": "<the phone number or email>" }
- If it's a contact name needing lookup: { "type": "lookup", "name": "<the name to search>" }`,
    },
    { role: 'user', content: `Recipient: "${to}"` },
  ];

  let address: string;

  try {
    const resolveResult = await chatService.chatWithFallback(resolveMessages, 'json');
    console.log('[sendIMessage] resolve LLM response:', resolveResult.content);
    const parsed = JSON.parse(resolveResult.content);

    if (parsed.type === 'direct') {
      address = parsed.address;
    } else {
      // Search contacts and let the LLM pick the right one
      const searchName = parsed.name || to;
      console.log('[sendIMessage] searching contacts for:', searchName);
      const candidates = await searchContacts(searchName);

      if (candidates.length === 0) {
        return `Could not find a contact named "${to}". Try using their phone number instead.`;
      }

      if (candidates.length === 1 && candidates[0].phone) {
        address = candidates[0].phone;
      } else {
        // Multiple matches or missing phone — let the LLM pick
        const contactList = candidates
          .map((c, i) => `${i + 1}. ${c.name} — phone: ${c.phone ?? 'none'}, email: ${c.email ?? 'none'}`)
          .join('\n');

        const pickMessages: import('./ollama-chat.js').ChatMessage[] = [
          {
            role: 'system',
            content: `The user wants to send a message to "${to}". Here are the matching contacts from their address book:

${contactList}

Pick the best match and return JSON: { "address": "<phone number or email to use>" }
If none of the contacts have a usable phone number or email, return: { "error": "No usable contact info found" }
Prefer phone numbers over email for iMessage.`,
          },
          { role: 'user', content: `Which contact should I send the message to?` },
        ];

        const pickResult = await chatService.chatWithFallback(pickMessages, 'json');
        const picked = JSON.parse(pickResult.content);

        if (picked.error) {
          return `Found contacts matching "${to}" but none had usable contact info: ${contactList}`;
        }
        address = picked.address;
      }
    }
  } catch {
    // LLM failed — fall back to searching contacts directly
    const candidates = await searchContacts(to);
    const withPhone = candidates.find(c => c.phone);
    if (!withPhone) {
      return `Could not find a contact named "${to}" with a phone number. Try using their phone number instead.`;
    }
    address = withPhone.phone!;
  }

  const escapedAddr = address.replace(/"/g, '\\"');
  const escapedMsg = messageBody.replace(/"/g, '\\"');
  const script = `tell application "Messages"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to buddy "${escapedAddr}" of targetService
  send "${escapedMsg}" to targetBuddy
end tell`;

  try {
    await execFileAsync('osascript', ['-e', script], { timeout: 15000 });
    return null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return `iMessage failed: ${msg}`;
  }
}

export async function deleteAppleReminder(title: string): Promise<string | null> {
  const escapedTitle = title.replace(/"/g, '\\"');
  const script = `tell application "Reminders"
  set found to false
  repeat with l in every list
    set matches to (every reminder of l whose name contains "${escapedTitle}" and completed is false)
    if (count of matches) > 0 then
      set matched to item 1 of matches
      set completed of matched to true
      set found to true
      exit repeat
    end if
  end repeat
  if not found then
    error "No reminder found matching \\"${escapedTitle}\\""
  end if
end tell`;

  try {
    await execFileAsync('osascript', ['-e', script]);
    console.log('[reminder] deleted (completed):', title);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[reminder] deletion failed:', message);
    return `Reminder deletion failed: ${message}`;
  }
}

export interface AppleReminderInfo {
  title: string;
  remindDate?: string;
  list: string;
}

export async function listAppleReminders(listName?: string): Promise<AppleReminderInfo[]> {
  const listFilter = listName
    ? `set theLists to {list "${listName.replace(/"/g, '\\"')}"}`
    : `set theLists to every list`;

  const script = `tell application "Reminders"
  ${listFilter}
  set output to ""
  repeat with l in theLists
    set listTitle to name of l
    set rems to (every reminder of l whose completed is false)
    repeat with r in rems
      set rName to name of r
      try
        set rDate to remind me date of r
        set dateStr to (rDate as string)
      on error
        set dateStr to ""
      end try
      set output to output & rName & "\\t" & dateStr & "\\t" & listTitle & "\\n"
    end repeat
  end repeat
  return output
end tell`;

  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 15000 });
    const lines = stdout.trim().split('\n').filter(l => l.length > 0);
    return lines.map(line => {
      const [title, remindDate, list] = line.split('\t');
      const info: AppleReminderInfo = { title, list };
      if (remindDate) info.remindDate = remindDate;
      return info;
    });
  } catch (error) {
    console.error('[reminder] list failed:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

export async function updateAppleReminder(
  currentTitle: string,
  updates: { newTitle?: string; newDate?: Date },
): Promise<string | null> {
  const escapedCurrent = currentTitle.replace(/"/g, '\\"');
  const setParts: string[] = [];

  if (updates.newTitle) {
    const escapedNew = updates.newTitle.replace(/"/g, '\\"');
    setParts.push(`set name of matched to "${escapedNew}"`);
  }

  if (updates.newDate) {
    const dateStr = updates.newDate.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeStr = updates.newDate.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    });
    setParts.push(`set remind me date of matched to date "${dateStr} at ${timeStr}"`);
  }

  if (setParts.length === 0) return 'No updates provided';

  const script = `tell application "Reminders"
  tell list "Reminders"
    set matches to (every reminder whose name contains "${escapedCurrent}" and completed is false)
    if (count of matches) > 0 then
      set matched to item 1 of matches
      ${setParts.join('\n      ')}
    else
      error "No reminder found matching \\"${escapedCurrent}\\""
    end if
  end tell
end tell`;

  try {
    await execFileAsync('osascript', ['-e', script]);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Reminder update failed: ${message}`;
  }
}
