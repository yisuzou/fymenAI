import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi } from 'vitest';
import { ClickableMarkdown } from '@/components/chat/ClickableMarkdown';

it('emits word on click', async () => {
  const fn = vi.fn();
  render(<ClickableMarkdown content="Hello 闭包" onWordClick={fn} />);
  await userEvent.click(screen.getByText('闭包'));
  expect(fn).toHaveBeenCalledWith('闭包');
});
