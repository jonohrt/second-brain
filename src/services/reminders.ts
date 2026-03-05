import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function reminderExists(title: string): Promise<boolean> {
  const escapedTitle = title.replace(/"/g, '\\"');
  const script = `tell application "Reminders"
  tell list "Reminders"
    set matches to (every reminder whose name is "${escapedTitle}" and completed is false)
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
  const exists = await reminderExists(title);
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
