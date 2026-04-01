// Helper: get local date as YYYY-MM-DD (not UTC)
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Chores module
const Chores = {
  chores: [],
  completions: [],
  rewards: [],
  selectedKidId: null,
  currentPoints: 0,
  streak: 0,

  async init() {
    await this.loadData();
    this.render();
  },

  async loadData() {
    [this.chores, this.completions, this.rewards] = await Promise.all([
      API.get('/chores'),
      API.get('/chores/status?date=' + localToday()),
      API.get('/chores/rewards')
    ]);

    // Default to first kid
    const kids = App.familyMembers.filter(m => m.role === 'kid');
    if (!this.selectedKidId && kids.length > 0) {
      this.selectedKidId = kids[0].id;
    }

    // Load points/streak for selected kid
    if (this.selectedKidId) {
      const data = await API.get(`/chores/points/${this.selectedKidId}`);
      this.currentPoints = data.member.total_points;
      this.streak = data.streak;
    }
  },

  render() {
    this.renderTabs();
    this.renderProgress();
    this.renderChoresList();
    this.renderPoints();
    this.renderRewards();
  },

  renderTabs() {
    const kids = App.familyMembers.filter(m => m.role === 'kid');
    const container = document.getElementById('chore-member-tabs');
    container.innerHTML = kids.map(k => `
      <button class="member-tab ${k.id === this.selectedKidId ? 'active' : ''}"
              style="--tab-color: ${k.color}"
              data-id="${k.id}">
        ${k.emoji} ${k.name}
      </button>
    `).join('');

    container.querySelectorAll('.member-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.selectedKidId = parseInt(btn.dataset.id);
        await this.loadData();
        this.render();
      });
    });
  },

  renderProgress() {
    const container = document.getElementById('chores-progress');
    const kidChores = this.getKidChores();
    const completed = this.getCompletedCount();
    const total = kidChores.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const kid = App.familyMembers.find(m => m.id === this.selectedKidId);
    const color = kid ? kid.color : 'var(--accent)';

    container.innerHTML = `
      <div class="progress-label">
        <span>${completed === total && total > 0 ? 'All done! 🎉' : 'Keep going!'}</span>
        <span class="progress-count">${completed} / ${total}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${pct}%; background: ${color}"></div>
      </div>
      ${completed === total && total > 0 ? '<div class="progress-complete">Amazing work today! ⭐</div>' : ''}
    `;
  },

  renderChoresList() {
    const container = document.getElementById('chores-list');
    const kidChores = this.getKidChores();

    container.innerHTML = kidChores.map(chore => {
      const done = this.isCompleted(chore.id);
      return `
        <div class="chore-card ${done ? 'completed' : ''}" data-chore-id="${chore.id}">
          <div class="chore-icon">${chore.icon}</div>
          <div class="chore-info">
            <div class="chore-title">${escapeHtml(chore.title)}</div>
            <div class="chore-points-badge">⭐ ${chore.points} points</div>
          </div>
          <div class="chore-check">${done ? '✓' : ''}</div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.chore-card').forEach(card => {
      card.addEventListener('click', () => this.toggleChore(card));
    });
  },

  renderPoints() {
    const container = document.getElementById('points-display');
    const kid = App.familyMembers.find(m => m.id === this.selectedKidId);

    container.innerHTML = `
      <div class="points-value">${this.currentPoints}</div>
      <div class="points-label">Total Points</div>
      ${this.streak > 0 ? `
        <div class="streak-display">
          <span class="streak-fire">🔥</span> ${this.streak} day streak!
        </div>
      ` : ''}
    `;
  },

  renderRewards() {
    const container = document.getElementById('rewards-list');
    container.innerHTML = this.rewards.map(r => `
      <div class="reward-card ${this.currentPoints < r.cost ? 'disabled' : ''}" data-reward-id="${r.id}">
        <div class="reward-icon">${r.icon}</div>
        <div class="reward-title">${escapeHtml(r.title)}</div>
        <div class="reward-cost">⭐ ${r.cost}</div>
      </div>
    `).join('');

    container.querySelectorAll('.reward-card:not(.disabled)').forEach(card => {
      card.addEventListener('click', () => this.redeemReward(card));
    });
  },

  getKidChores() {
    return this.chores.filter(c =>
      !c.assigned_to || c.assigned_to === this.selectedKidId
    );
  },

  isCompleted(choreId) {
    return this.completions.some(c =>
      c.chore_id === choreId && c.member_id === this.selectedKidId
    );
  },

  getCompletedCount() {
    const kidChores = this.getKidChores();
    return kidChores.filter(c => this.isCompleted(c.id)).length;
  },

  async toggleChore(card) {
    const choreId = parseInt(card.dataset.choreId);
    const done = this.isCompleted(choreId);

    if (done) {
      await API.post(`/chores/${choreId}/uncomplete`, { member_id: this.selectedKidId, date: localToday() });
    } else {
      // Animate
      card.classList.add('completing');
      const result = await API.post(`/chores/${choreId}/complete`, { member_id: this.selectedKidId, date: localToday() });

      if (result.error) {
        card.classList.remove('completing');
        return;
      }

      this.currentPoints = result.total_points;

      // Confetti!
      launchConfetti();

      // Show points earned
      showCelebration(`+${result.points_earned} ⭐`);

      setTimeout(() => card.classList.remove('completing'), 400);
    }

    await this.loadData();
    this.render();
  },

  async redeemReward(card) {
    const rewardId = parseInt(card.dataset.rewardId);
    const reward = this.rewards.find(r => r.id === rewardId);
    if (!reward) return;

    const kid = App.familyMembers.find(m => m.id === this.selectedKidId);
    if (!confirm(`${kid.name} wants to redeem "${reward.title}" for ${reward.cost} points?`)) return;

    const result = await API.post(`/chores/rewards/${rewardId}/redeem`, { member_id: this.selectedKidId });
    if (result.error) {
      alert(result.error);
      return;
    }

    this.currentPoints = result.total_points;
    launchConfetti();
    showCelebration(`🎉 ${reward.icon} Redeemed!`);
    await this.loadData();
    this.render();
  }
};

// Confetti system
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#FF6B6B', '#6C5CE7', '#00B894', '#FDCB6E', '#E17055', '#0984E3'];

  for (let i = 0; i < 60; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 15,
      vy: -Math.random() * 15 - 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
      life: 1
    });
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    particles.forEach(p => {
      if (p.life <= 0) return;
      alive = true;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.4; // gravity
      p.rotation += p.rotSpeed;
      p.life -= 0.015;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });

    if (alive) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  animate();
}

function showCelebration(text) {
  const div = document.createElement('div');
  div.className = 'celebration';
  div.innerHTML = `<div class="celebration-text">${text}</div>`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 1500);
}
