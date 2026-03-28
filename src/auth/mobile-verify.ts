// src/auth/mobile-verify.ts

import axios from 'axios';

export interface MobileCredentials {
  client_id: string;
  client_secret: string;
  base_url: string;
}

const MOBILE_VERIFY_URL = 'https://sso.canvaslms.com/api/v1/mobile_verify.json';
const CANVAS_APP_UA = 'candroid/8.6.1 (289)';

export async function fetchMobileCredentials(canvasDomain: string): Promise<MobileCredentials> {
  const response = await axios.get(MOBILE_VERIFY_URL, {
    params: {
      domain: canvasDomain,
      user_agent: CANVAS_APP_UA,
    },
    headers: {
      'User-Agent': CANVAS_APP_UA,
    },
  });

  const data = response.data;

  if (!data.client_id || !data.client_secret) {
    throw new Error(
      `mobile_verify failed for ${canvasDomain}: ${JSON.stringify(data)}`
    );
  }

  return {
    client_id: data.client_id,
    client_secret: data.client_secret,
    base_url: data.base_url,
  };
}
