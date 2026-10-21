// Open Food Facts требует User-Agent с тем, кто спрашивает и как с ним связаться.

import packageJson from '../../../package.json' with { type: 'json' };

export const USER_AGENT = `count-kcal-bot/${packageJson.version} (Telegram @count_kcal_bot)`;
