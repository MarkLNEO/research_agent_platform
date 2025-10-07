import { FullConfig } from '@playwright/test';

export default async function globalSetup(_config: FullConfig) {
  // Do not attempt UI login here; web servers are not started yet.
  // Let individual tests handle login once the app servers are up.
  const fs = await import('fs');
  fs.writeFileSync('storageState.json', JSON.stringify({ cookies: [], origins: [] }));
}
