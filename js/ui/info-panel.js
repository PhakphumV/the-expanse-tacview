// js/ui/info-panel.js
// Shared info panel with Summary / Events tabs. Switching tabs only
// toggles CSS classes on the tab strip and content panes — it never
// touches playback time, camera mode, or event selection.

import { createListenerScope } from '../utils/listeners.js';

export function createInfoPanel(eventLog) {
    const listeners = createListenerScope();
    const tabSummary = document.getElementById('tabSummary');
    const tabEvents = document.getElementById('tabEvents');
    const paneSummary = document.getElementById('paneSummary');
    const paneEvents = document.getElementById('paneEvents');
    let activeTab = 'summary';

    function update() {
        if (!tabSummary || !tabEvents || !paneSummary || !paneEvents) return;
        const summaryActive = activeTab === 'summary';
        tabSummary.classList.toggle('active', summaryActive);
        tabEvents.classList.toggle('active', !summaryActive);
        paneSummary.classList.toggle('active', summaryActive);
        paneEvents.classList.toggle('active', !summaryActive);
    }

    function activate(which) {
        activeTab = which === 'events' ? 'events' : 'summary';
        update();
        // A display:none pane reports offsetTop 0, so re-sync the event
        // log's auto-scroll when the Events pane becomes visible again.
        if (activeTab === 'events' && eventLog && eventLog.refresh) eventLog.refresh();
    }

    function reset() {
        activeTab = 'summary';
        update();
    }

    function destroy() {
        listeners.destroy();
        reset();
    }

    if (tabSummary && tabEvents && paneSummary && paneEvents) {
        listeners.listen(tabSummary, 'click', () => activate('summary'));
        listeners.listen(tabEvents, 'click', () => activate('events'));
        update();
    }

    return { activate, update, reset, destroy };
}
