import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecFile = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));
vi.mock('node:util', () => ({
  promisify: () => mockExecFile,
}));

import { findAppleReminder, updateAppleReminder } from '../../src/services/reminders';

describe('findAppleReminder', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it('returns true when stdout is "true"', async () => {
    mockExecFile.mockResolvedValue({ stdout: 'true\n' });
    const result = await findAppleReminder('Buy groceries');
    expect(result).toBe(true);
  });

  it('returns false when stdout is "false"', async () => {
    mockExecFile.mockResolvedValue({ stdout: 'false\n' });
    const result = await findAppleReminder('Buy groceries');
    expect(result).toBe(false);
  });
});

describe('updateAppleReminder', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it('calls osascript with correct script containing old and new titles', async () => {
    mockExecFile.mockResolvedValue({ stdout: '' });
    await updateAppleReminder('Old Title', { newTitle: 'New Title' });

    expect(mockExecFile).toHaveBeenCalledWith('osascript', ['-e', expect.stringContaining('Old Title')]);
    expect(mockExecFile).toHaveBeenCalledWith('osascript', ['-e', expect.stringContaining('New Title')]);
  });

  it('returns error message on osascript failure', async () => {
    mockExecFile.mockRejectedValue(new Error('script error'));
    const result = await updateAppleReminder('Old Title', { newTitle: 'New Title' });
    expect(result).toBe('Reminder update failed: script error');
  });

  it('returns "No updates provided" when no updates given', async () => {
    const result = await updateAppleReminder('Old Title', {});
    expect(result).toBe('No updates provided');
  });
});
