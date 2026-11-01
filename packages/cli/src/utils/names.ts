/**
 * Names accepted for ecosystem hooks, plugins, and skills. Every name becomes
 * a directory segment under the project (or is interpolated into a GitHub
 * path), so anything that can escape its parent (`..`, path separators,
 * absolute paths) is rejected before any filesystem or network work.
 */

const ECOSYSTEM_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/** Validation error for an ecosystem name, or undefined when valid. */
export function validateEcosystemName(name: string): string | undefined {
    if (!name) {
        return 'Name cannot be empty.';
    }
    if (name.includes('..')) {
        return `Invalid name "${name}" — ".." path segments are not allowed.`;
    }
    if (!ECOSYSTEM_NAME_PATTERN.test(name)) {
        return `Invalid name "${name}" — use lowercase letters, digits, ".", "-" or "_", starting with a letter or digit (e.g. jwt-auth).`;
    }
    return undefined;
}

/** Throws when an ecosystem name is invalid; see {@link validateEcosystemName}. */
export function assertValidEcosystemName(name: string): void {
    const error = validateEcosystemName(name);
    if (error) {
        throw new Error(error);
    }
}
