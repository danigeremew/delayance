import { API_URL } from './api';
import type { User } from './auth-context';

export async function submitAuth<T>(path: string, body: Record<string, string>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Authentication is temporarily unavailable. Please try again.');
  }
  const result = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok)
    throw new Error(
      Array.isArray(result.message)
        ? result.message[0]
        : (result.message ?? 'Request failed. Please try again.'),
    );
  return result as T;
}
export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  user: User;
}
