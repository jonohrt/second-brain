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

async function resolveContact(name: string): Promise<string | null> {
  const escapedName = name.replace(/"/g, '\\"');
  // Search Contacts.app for a phone number matching the name
  const script = `tell application "Contacts"
  set matchedPeople to (every person whose name contains "${escapedName}")
  if (count of matchedPeople) > 0 then
    set p to item 1 of matchedPeople
    set phoneNumbers to value of every phone of p
    if (count of phoneNumbers) > 0 then
      return item 1 of phoneNumbers
    end if
    -- fall back to email
    set emails to value of every email of p
    if (count of emails) > 0 then
      return item 1 of emails
    end if
  end if
  return ""
end tell`;

  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 10000 });
    const result = stdout.trim();
    return result || null;
  } catch {
    return null;
  }
}

export async function sendIMessage(
  to: string,
  message: string,
): Promise<string | null> {
  const escapedMsg = message.replace(/"/g, '\\"');

  // If "to" looks like a phone number or email, use directly; otherwise resolve via Contacts
  const isDirect = /^[+\d()\s-]{7,}$/.test(to) || to.includes('@');
  let address = to;

  if (!isDirect) {
    const resolved = await resolveContact(to);
    if (!resolved) {
      return `Could not find a contact named "${to}". Try using their phone number instead.`;
    }
    address = resolved;
  }

  const escapedAddr = address.replace(/"/g, '\\"');
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
