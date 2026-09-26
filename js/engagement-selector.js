// js/engagement-selector.js
// Engagement dropdown: populated from the loaded collection and switches
// engagements without a page reload. Empty and malformed dataset states
// are surfaced in the #dataError banner instead of failing silently.

export function createEngagementSelector(playbackEngine, onSelect) {
    const select = document.getElementById('engagementSelect');
    const errorEl = document.getElementById('dataError');

    function showError(msg) {
        if (errorEl) {
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
        }
        console.error('engagement-selector: ' + msg);
    }

    function clearError() {
        if (errorEl) errorEl.style.display = 'none';
    }

    // (Re)fill the dropdown from the collection metadata. Selecting the
    // first engagement is the deterministic default, handled by
    // playback.loadCollection().
    function populate() {
        if (!select) return;
        const list = playbackEngine.getEngagements();
        select.innerHTML = '';
        if (list.length === 0) {
            select.disabled = true;
            showError('No engagements found in data/engagement.json.');
            return;
        }
        select.disabled = false;
        for (const e of list) {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = e.name;
            select.appendChild(opt);
        }
        const active = playbackEngine.getActiveEngagementId();
        if (active) select.value = active;
    }

    // Restore the dropdown to the still-active engagement (used when a
    // selection fails to load).
    function syncToActive() {
        const active = playbackEngine.getActiveEngagementId();
        if (select && active) select.value = active;
    }

    if (select) {
        select.addEventListener('change', function () {
            onSelect(select.value);
        });
    }

    return { populate, syncToActive, showError, clearError };
}
