// src/auth/token-refresh.ts

import axios from 'axios';

export class RefreshTokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefreshTokenExpiredError';
  }
}

export interface RefreshParams {
  domain: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export async function refreshAccessToken(params: RefreshParams): Promise<{ access_token: string }> {
  try {
    const response = await axios.post(
      `https://${params.domain}/login/oauth2/token`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: params.clientId,
        client_secret: params.clientSecret,
        refresh_token: params.refreshToken,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      }
    );

    if (!response.data.access_token) {
      throw new RefreshTokenExpiredError('Token refresh returned no access_token');
    }

    return { access_token: response.data.access_token };
  } catch (error: unknown) {
    if (error instanceof RefreshTokenExpiredError) throw error;

    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      if (status === 400 || status === 401) {
        throw new RefreshTokenExpiredError(
          `Refresh token rejected (${status}): token may have been revoked`
        );
      }
    }

    throw error;
  }
}
