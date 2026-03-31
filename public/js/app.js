// Main app
const App = {
  familyMembers: [],
  selectedMemberId: null,

  async init() {
    // Load family members
    this.familyMembers = await API.get('/family');

    // Render family bar
    this.renderFamilyBar();
    this.updateDateDisplay();

    // Setup navigation
    this.setupNav();

    // Initialize calendar (default view)
    Calendar.init();

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  },

  renderFamilyBar() {
    const container = document.getElementById('family-members');
    container.innerHTML = `
      <div class="family-chip active" data-id="" style="--chip-color: var(--accent)">
        <span class="chip-emoji">👨‍👩‍👧‍👦</span>
        <span>All</span>
      </div>
      ${this.familyMembers.map(m => `
        <div class="family-chip" data-id="${m.id}" style="--chip-color: ${m.color}">
          <span class="chip-emoji">${m.emoji}</span>
          <span>${m.name}</span>
        </div>
      `).join('')}
    `;

    container.querySelectorAll('.family-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('.family-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.selectedMemberId = chip.dataset.id ? parseInt(chip.dataset.id) : null;
        // Refresh current view
        this.refreshCurrentView();
      });
    });
  },

  updateDateDisplay() {
    const now = new Date();
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    document.getElementById('current-date-display').textContent = now.toLocaleDateString('en-US', options);
  },

  setupNav() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;

        // Update active tab
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Show view
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${view}`).classList.add('active');

        // Initialize view
        this.initView(view);
      });
    });
  },

  async initView(view) {
    switch (view) {
      case 'calendar':
        Calendar.render();
        break;
      case 'chores':
        await Chores.init();
        break;
      case 'dashboard':
        await Dashboard.init();
        break;
    }
  },

  refreshCurrentView() {
    const activeTab = document.querySelector('.nav-tab.active');
    if (activeTab) {
      this.initView(activeTab.dataset.view);
    }
  }
};

// Start the app
document.addEventListener('DOMContentLoaded', () => App.init());
