export function isEmailAllowed(email) {
    if (!email)
        return false;
    // Global test bypass: when ACCESS_ALLOW_BYPASS=true, skip allowlist checks
    if ((process.env.ACCESS_ALLOW_BYPASS || '').toLowerCase() === 'true')
        return true;
    const allowlist = (process.env.ACCESS_ALLOWLIST || '').split(/[;,\s]+/).filter(Boolean).map(s => s.toLowerCase());
    const domains = (process.env.ACCESS_ALLOWED_DOMAINS || '').split(/[;,\s]+/).filter(Boolean).map(s => s.toLowerCase());
    if (allowlist.length === 0 && domains.length === 0)
        return true; // no restrictions configured
    const lower = email.toLowerCase();
    if (allowlist.includes(lower))
        return true;
    const domain = lower.split('@')[1] || '';
    if (domains.includes(domain))
        return true;
    return false;
}
export function assertEmailAllowed(email) {
    if (!isEmailAllowed(email)) {
        const configured = Boolean((process.env.ACCESS_ALLOWLIST || process.env.ACCESS_ALLOWED_DOMAINS || '').trim());
        const message = configured
            ? 'Access restricted. Your account is not on the allowlist.'
            : 'Unauthorized';
        const err = new Error(message);
        err.statusCode = 403;
        throw err;
    }
}
