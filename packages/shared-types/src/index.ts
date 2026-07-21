export type ProjectRole = 'owner' | 'editor' | 'contributor' | 'reviewer' | 'viewer';

export interface ApiErrorBody {
  statusCode: number;
  message: string;
  error: string;
  details?: unknown;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}
