// js/info-panel.js
// Shared info panel with Summary / Events tabs. Switching tabs only
// toggles CSS classes on the tab strip and content panes — it never
// touches playback time, camera mode, or event selection.

export function createInfoPanel(eventLog) {
    const tabSummary = document.getElementById('tabSummary');
    const tabEvents = document.getElementById('tabEvents');
    const paneSummary = document.getElementById('paneSummary');
    const paneEvents = document.getElementById('paneEvents');
    if (!tabSummary || !tabEvents || !paneSummary || !paneEvents) return { activate: function () {} };

    function activate(which) {
        const summaryActive = which === 'summary';
        tabSummary.classList.toggle('active', summaryActive);
        tabEvents.classList.toggle('active', !summaryActive);
        paneSummary.classList.toggle('active', summaryActive);
        paneEvents.classList.toggle('active', !summaryActive);
        // A display:none pane reports offsetTop 0, so re-sync the event
        // log's auto-scroll when the Events pane becomes visible again.
        if (!summaryActive && eventLog && eventLog.refresh) eventLog.refresh();
    }

    tabSummary.addEventListener('click', function () { activate('summary'); });
    tabEvents.addEventListener('click', function () { activate('events'); });

    return { activate };
}
