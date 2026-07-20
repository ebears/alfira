import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { createPlaylist } from '../api/api';
import { Button } from '../components/ui/Button';

async function createPlaylistAction(
  _prevState: unknown,
  formData: FormData
): Promise<{ error: string | null }> {
  const name = formData.get('name') as string;
  if (!name.trim()) {
    return { error: 'Playlist name is required' };
  }
  const tagNameLower = (formData.get('tagNameLower') as string).trim() || undefined;
  try {
    await createPlaylist(name.trim(), tagNameLower);
    return { error: null };
  } catch {
    return { error: 'Could not create playlist. Try again.' };
  }
}

export function useCreatePlaylist() {
  return useActionState(createPlaylistAction, null);
}

export function CreatePlaylistSubmitButton({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button variant='primary' type='submit' disabled={disabled || pending}>
      {children}
    </Button>
  );
}
