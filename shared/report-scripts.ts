const TOGGLE_PASSED_JS = `function togglePassed() {
    var rows = document.querySelectorAll('.row-passed');
    var btn = document.getElementById('toggleBtn');
    var hidden = rows.length > 0 && rows[0].style.display === 'none';
    rows.forEach(function(r) { r.style.display = hidden ? '' : 'none'; });
    if (btn) btn.textContent = hidden ? 'Hide Passed' : 'Show Passed';
}
`;

const FILTER_JS = `function filterTable() {
    var q = document.getElementById('searchInput').value.toLowerCase();
    var rows = document.querySelectorAll('tbody tr');
    rows.forEach(function(r) {
        if (r.classList.contains('detail-row')) return;
        r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}
function filterByHierarchy(suite) {
    var q = document.getElementById('searchInput');
    if (q) q.value = 'h:' + suite;
    var rows = document.querySelectorAll('tbody tr');
    rows.forEach(function(r) {
        if (r.classList.contains('detail-row')) return;
        var hierarchy = r.getAttribute('data-hierarchy') || '';
        var match = hierarchy.toLowerCase().indexOf(suite.toLowerCase()) !== -1;
        r.style.display = match ? '' : 'none';
    });
    var nodes = document.querySelectorAll('.tree-node');
    nodes.forEach(function(n) { n.classList.remove('active'); });
    var targets = document.querySelectorAll('.tree-node');
    targets.forEach(function(n) {
        if (n.textContent.trim().indexOf(suite) !== -1) n.classList.add('active');
    });
}
function clearHierarchy() {
    var q = document.getElementById('searchInput');
    if (q) q.value = '';
    var rows = document.querySelectorAll('tbody tr');
    rows.forEach(function(r) { r.style.display = ''; });
    var nodes = document.querySelectorAll('.tree-node');
    nodes.forEach(function(n) { n.classList.remove('active'); });
}
`;

const EXPORT_CSV_JS = `function exportCsv() {
    var headers = Array.from(document.querySelectorAll('thead th')).map(function(th) { return th.textContent.trim(); });
    var rows = document.querySelectorAll('tbody tr');
    var csv = headers.join(',') + '\\n';
    rows.forEach(function(r) {
        if (r.style.display !== 'none') {
            if (r.classList.contains('detail-row')) return;
            var cells = r.querySelectorAll('td');
            var vals = Array.from(cells).map(function(c) { return '"' + c.textContent.trim().replace(/"/g, '""') + '"'; });
            csv += vals.join(',') + '\\n';
        }
    });
    var blob = new Blob([csv], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'test-report.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}
`;

const SWITCH_TIMELINE_DETAIL_JS = `function switchTab(index) {
    var tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(function(t, i) { t.classList.toggle('active', i === index); });
    var contents = document.querySelectorAll('.tab-content');
    contents.forEach(function(c, i) { c.classList.toggle('active', i === index); });
}
function toggleTimeline() {
    var body = document.getElementById('timelineBody');
    var btn = document.getElementById('timelineToggle');
    if (!body || !btn) return;
    var hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    btn.textContent = hidden ? 'Hide' : 'Show';
}
function toggleDetail(index) {
    var row = document.getElementById('detail-row-' + index);
    if (!row) return;
    var hidden = row.style.display === 'none' || row.style.display === '';
    row.style.display = hidden ? 'table-row' : 'none';
}
`;

const SCROLL_JS = `function scrollToTest(title) {
    var rows = document.querySelectorAll('tbody tr');
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.classList.contains('detail-row')) continue;
        var firstTd = r.querySelector('td');
        if (firstTd && firstTd.textContent.trim() === title) {
            r.scrollIntoView({ behavior: 'smooth', block: 'center' });
            r.style.background = '#fef3c7';
            setTimeout(function() { r.style.background = ''; }, 2000);
            return;
        }
    }
}
`;

const TREE_NODE_JS = `function toggleTreeNode(el) {
    if (!el) return;
    var parent = el.parentElement;
    if (!parent) return;
    var children = parent.querySelector('.tree-children');
    if (children) {
        children.style.display = children.style.display === 'none' ? '' : 'none';
    }
}
`;

const ERROR_CLICK_JS = `document.querySelectorAll('.error-truncated').forEach(function(el) {
    el.addEventListener('click', function() {
        if (this.classList.contains('expanded')) {
            this.textContent = this.getAttribute('data-full').slice(0, 120) + '...';
            this.classList.remove('expanded');
        } else {
            this.textContent = this.getAttribute('data-full');
            this.classList.add('expanded');
        }
    });
});
`;

export function buildToggleScript(): string {
    return `<script>
${TOGGLE_PASSED_JS}${FILTER_JS}${EXPORT_CSV_JS}${SWITCH_TIMELINE_DETAIL_JS}${SCROLL_JS}${TREE_NODE_JS}${ERROR_CLICK_JS}</script>`;
}
