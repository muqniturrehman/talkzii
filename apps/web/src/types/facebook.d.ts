/** Minimal typings for the Facebook JS SDK used by Embedded Signup. */
interface FacebookAuthResponse {
  code?: string;
  accessToken?: string;
  userID?: string;
  expiresIn?: number;
}

interface FacebookLoginResponse {
  status: 'connected' | 'not_authorized' | 'unknown';
  authResponse: FacebookAuthResponse | null;
}

interface FacebookLoginOptions {
  config_id: string;
  response_type: 'code';
  override_default_response_type: boolean;
  extras?: Record<string, unknown>;
}

interface FacebookSdk {
  init(options: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }): void;
  /** The callback must be a plain (non-async) function. */
  login(callback: (response: FacebookLoginResponse) => void, options: FacebookLoginOptions): void;
}

interface Window {
  FB?: FacebookSdk;
  fbAsyncInit?: () => void;
}
