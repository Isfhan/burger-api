import { Burger, setDir } from '../../../src/index';
import { z } from 'zod';

// Phase 3 example app — exercises every Validation 2.0 integration scenario
// (phase3 §16.2): coercion, headers/cookie slots, response validation
// (dev + enforce), model refs, and backward compatibility (routes with no schema).
const app = new Burger({
    apiDir: setDir(__dirname, 'api'),
    debug: true,
    // Coercion ON app-wide so query/params string → typed values (phase3 §7).
    validation: { coerce: true, responseValidation: 'enforce', errorFormat: 'plain' },
    // Reusable named models, referenced by string from route schemas (phase3 §9).
    models: {
        Pagination: z.object({
            page: z.number().min(1).default(1),
            limit: z.number().min(1).max(100).default(20),
        }),
    },
});

const port = Number(process.env.PORT) || 4000;
app.serve(port, () => {
    console.log(`Phase 3 validation example running on http://localhost:${port}`);
});
