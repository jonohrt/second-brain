import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function findAppleReminder(title: string): Promise<boolean> {
  const escapedTitle = title.replace(/"/g, '\\"');
  const script = `tell application "Reminders"
  tell list "Reminders"
    set matches to (every reminder whose name contains "${escapedTitle}" and completed is false)
    return (count of matches) > 0
  end tell
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
  tell list "Reminders"
    make new reminder with properties {name:"${escapedTitle}", remind me date:date "${appleDate}"}
  end tell
end tell`;

  try {
    await execFileAsync('osascript', ['-e', script]);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Reminder creation failed: ${message}`;
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
