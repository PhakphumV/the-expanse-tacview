export function createListenerScope() {
    const registrations = [];

    function listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        registrations.push({ target, type, handler, options });
    }

    function destroy() {
        for (const registration of registrations) {
            registration.target.removeEventListener(
                registration.type,
                registration.handler,
                registration.options
            );
        }
        registrations.length = 0;
    }

    return { listen, destroy };
}