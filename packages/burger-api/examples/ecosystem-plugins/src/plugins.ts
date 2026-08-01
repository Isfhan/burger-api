import { apiKey } from '../../../../../ecosystem/plugins/api-key/api-key';

export default function (burger: import('burger-api').Burger) {
    burger.usePlugin(apiKey({
        keys: ['demo-api-key-123'],
    }));
}
