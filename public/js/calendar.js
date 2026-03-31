// Calendar module
const Calendar = {
  currentDate: new Date(),
  selectedDate: null,
  events: [],
  selectedEventIcon: '📅',

  init() {
    this.renderWeekdays();
    this.render();
    this.bindEvents();
  },

  bindEvents() {
    document.getElementById('cal-prev').addEventListener('click', () => {
      this.currentDate.setMonth(this.currentDate.getMonth() - 1);
      this.render();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
      this.currentDate.setMonth(this.currentDate.getMonth() + 1);
      this.render();
    });
    document.getElementById('day-detail-close').addEventListener('click', () => {
      this.closeDetail();
    });
    document.getElementById('add-event-btn').addEventListener('click', () => {
      openEventModal(this.selectedDate);
    });

    // Swipe support
    let touchStartX = 0;
    const grid = document.getElementById('cal-grid');
    grid.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    grid.addEventListener('touchend', e => {
      const diff = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(diff) > 80) {
        if (diff > 0) {
          this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        } else {
          this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        }
        this.render();
      }
    }, { passive: true });
  },

  renderWeekdays() {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    document.getElementById('cal-weekdays').innerHTML = days
      .map(d => `<div class="cal-weekday">${d}</div>`)
      .join('');
  },

  async render() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

    // Update title
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('cal-month-title').textContent = `${monthNames[month]} ${year}`;

    // Fetch events
    this.events = await API.get(`/events?month=${monthStr}`);

    // Build calendar grid
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    let html = '';

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrev - i;
      html += `<div class="cal-day other-month"><span class="cal-day-number">${day}</span></div>`;
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === this.selectedDate;
      const dayEvents = this.events.filter(e => e.date === dateStr);

      // Filter by selected family member
      const filteredEvents = App.selectedMemberId
        ? dayEvents.filter(e => e.member_id === App.selectedMemberId || !e.member_id)
        : dayEvents;

      const dots = filteredEvents.map(e => {
        const color = e.member_color || 'var(--accent)';
        return `<span class="cal-dot" style="background:${color}"></span>`;
      }).join('');

      const classes = ['cal-day'];
      if (isToday) classes.push('today');
      if (isSelected) classes.push('selected');

      html += `
        <div class="${classes.join(' ')}" data-date="${dateStr}">
          <span class="cal-day-number">${day}</span>
          <div class="cal-day-dots">${dots}</div>
        </div>`;
    }

    // Next month days
    const totalCells = firstDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
      html += `<div class="cal-day other-month"><span class="cal-day-number">${i}</span></div>`;
    }

    document.getElementById('cal-grid').innerHTML = html;

    // Day click handlers
    document.querySelectorAll('.cal-day:not(.other-month)').forEach(el => {
      el.addEventListener('click', () => {
        this.selectedDate = el.dataset.date;
        this.render();
        this.showDetail(el.dataset.date);
      });
    });

    // Re-show detail if date selected
    if (this.selectedDate) {
      this.showDetail(this.selectedDate);
    }
  },

  async showDetail(dateStr) {
    const detail = document.getElementById('day-detail');
    detail.classList.remove('hidden');

    const date = new Date(dateStr + 'T12:00:00');
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    document.getElementById('day-detail-title').textContent = date.toLocaleDateString('en-US', options);

    const dayEvents = this.events.filter(e => e.date === dateStr);
    const filtered = App.selectedMemberId
      ? dayEvents.filter(e => e.member_id === App.selectedMemberId || !e.member_id)
      : dayEvents;

    const container = document.getElementById('day-detail-events');
    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="no-events">
          <span class="empty-icon">🌈</span>
          Nothing planned — enjoy the day!
        </div>`;
      return;
    }

    container.innerHTML = filtered.map(e => `
      <div class="event-card" style="--event-color: ${e.member_color || 'var(--accent)'}">
        <span class="event-icon">${e.icon || '📅'}</span>
        <div class="event-info">
          <div class="event-title">${escapeHtml(e.title)}</div>
          ${e.start_time ? `<div class="event-time">${formatTime(e.start_time)}${e.end_time ? ' - ' + formatTime(e.end_time) : ''}</div>` : ''}
          ${e.member_name ? `<div class="event-member">${e.member_emoji} ${e.member_name}</div>` : '<div class="event-member">👨‍👩‍👧‍👦 Everyone</div>'}
        </div>
        <div class="event-actions">
          <button class="event-action-btn" onclick="editEvent(${e.id})" title="Edit">✏️</button>
          <button class="event-action-btn" onclick="deleteEvent(${e.id})" title="Delete">🗑️</button>
        </div>
      </div>
    `).join('');
  },

  closeDetail() {
    document.getElementById('day-detail').classList.add('hidden');
    this.selectedDate = null;
    this.render();
  }
};

// Event modal helpers
function openEventModal(date) {
  const modal = document.getElementById('event-modal');
  modal.classList.remove('hidden');
  document.getElementById('event-modal-title').textContent = 'Add Event';
  document.getElementById('event-id').value = '';
  document.getElementById('event-title').value = '';
  document.getElementById('event-date').value = date || new Date().toISOString().split('T')[0];
  document.getElementById('event-start').value = '';
  document.getElementById('event-end').value = '';
  document.getElementById('event-recurrence').value = '';
  Calendar.selectedEventIcon = '📅';
  document.getElementById('event-icon-picker-btn').textContent = '📅';

  // Build member select
  const select = document.getElementById('event-member-select');
  select.innerHTML = `
    <div class="member-option selected" data-id="" style="--option-color: var(--accent)">
      <span>👨‍👩‍👧‍👦</span> Everyone
    </div>
    ${App.familyMembers.map(m => `
      <div class="member-option" data-id="${m.id}" style="--option-color: ${m.color}">
        <span>${m.emoji}</span> ${m.name}
      </div>
    `).join('')}
  `;

  select.querySelectorAll('.member-option').forEach(opt => {
    opt.addEventListener('click', () => {
      select.querySelectorAll('.member-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });

  // Icon picker
  setupEmojiPicker(icon => {
    Calendar.selectedEventIcon = icon;
    document.getElementById('event-icon-picker-btn').textContent = icon;
  });

  // Form submit
  document.getElementById('event-form').onsubmit = async (e) => {
    e.preventDefault();
    const eventId = document.getElementById('event-id').value;
    const selectedMember = select.querySelector('.member-option.selected');
    const data = {
      title: document.getElementById('event-title').value,
      icon: Calendar.selectedEventIcon,
      date: document.getElementById('event-date').value,
      start_time: document.getElementById('event-start').value || null,
      end_time: document.getElementById('event-end').value || null,
      member_id: selectedMember.dataset.id ? parseInt(selectedMember.dataset.id) : null,
      recurrence: document.getElementById('event-recurrence').value || null
    };

    if (eventId) {
      await API.put(`/events/${eventId}`, data);
    } else {
      await API.post('/events', data);
    }
    closeEventModal();
    Calendar.render();
  };
}

function closeEventModal() {
  document.getElementById('event-modal').classList.add('hidden');
  document.getElementById('emoji-picker').classList.add('hidden');
}

async function editEvent(id) {
  const event = Calendar.events.find(e => e.id === id);
  if (!event) return;

  openEventModal(event.date);
  document.getElementById('event-modal-title').textContent = 'Edit Event';
  document.getElementById('event-id').value = event.id;
  document.getElementById('event-title').value = event.title;
  document.getElementById('event-date').value = event.date;
  document.getElementById('event-start').value = event.start_time || '';
  document.getElementById('event-end').value = event.end_time || '';
  document.getElementById('event-recurrence').value = event.recurrence || '';
  Calendar.selectedEventIcon = event.icon || '📅';
  document.getElementById('event-icon-picker-btn').textContent = Calendar.selectedEventIcon;

  // Select member
  const memberId = event.member_id ? String(event.member_id) : '';
  const select = document.getElementById('event-member-select');
  select.querySelectorAll('.member-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.id === memberId);
  });
}

async function deleteEvent(id) {
  if (!confirm('Delete this event?')) return;
  await API.del(`/events/${id}`);
  Calendar.render();
}

// Emoji picker setup
const EMOJI_LIST = ['📅', '🎂', '🎉', '🏫', '⚽', '🎸', '🎨', '🏊',
  '🚗', '✈️', '🏥', '🎭', '📚', '🎮', '🍕', '🛒',
  '💼', '🎤', '🧪', '🌳', '🐕', '🎯', '🏆', '💪',
  '🧹', '🍳', '💤', '🎬', '🎵', '🏃', '🚴', '🎪'];

function setupEmojiPicker(onSelect) {
  const picker = document.getElementById('emoji-picker');
  const grid = picker.querySelector('.emoji-grid');
  grid.innerHTML = EMOJI_LIST.map(e =>
    `<button type="button">${e}</button>`
  ).join('');

  grid.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      onSelect(btn.textContent);
      picker.classList.add('hidden');
    });
  });

  document.getElementById('event-icon-picker-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const rect = e.target.getBoundingClientRect();
    picker.style.top = `${rect.bottom + 8}px`;
    picker.style.left = `${rect.left}px`;
    picker.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!picker.contains(e.target) && e.target.id !== 'event-icon-picker-btn') {
      picker.classList.add('hidden');
    }
  });
}

// Helpers
function formatTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
