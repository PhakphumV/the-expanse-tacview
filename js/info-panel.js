// js/info-panel.js
// Tab controller for the right-side info panel that merges the
// engagement summary and event log into a single panel with two tabs.
//
// Behavior:
//   - Exactly one tab is active at a time.
//   - Switching tabs changes only the visible content; it never touches
//     playback time, playing state, speed, camera mode, or selection.
//   - The selected tab remains stable during normal playback and
//     scrubbing unless the user clicks another tab.
//   - Tab content elements are looked up once; switching is a single
//     class swap on two elements (active on the button, active on the
//     content section).

const TAB_BTN_SELECTOR = '.info-tab';
const TAB_CONTENT_SELECTOR = '.info-content';

export function createInfoPanel() {
    const panel = document.getElementById('infoPanel');
    if (!panel) return { activate: () => {}, getActiveTab: () => null };

    const buttons = Array.from(panel.querySelectorAll(TAB_BTN_SELECTOR));
    const contents = Array.from(panel.querySelectorAll(TAB_CONTENT_SELECTOR));

    function activate(tabName) {
        if (!tabName) return;
        for (const btn of buttons) {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', String(isActive));
        }
        for (const content of contents) {
            content.classList.toggle('active', content.dataset.tab === tabName);
        }
    }

    function getActiveTab() {
        const active = buttons.find((b) => b.classList.contains('active'));
        return active ? active.dataset.tab : null;
    }

    for (const btn of buttons) {
        btn.addEventListener('click', () => activate(btn.dataset.tab));
    }

    // Initialize: pick whatever tab the markup already marks active;
    // fall back to the first tab if no markup default exists.
    if (!getActiveTab() && buttons.length > 0) {
        activate(buttons[0].dataset.tab);
    }

    return { activate, getActiveTab };
}
