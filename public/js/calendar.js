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
      this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
      this.render();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
      this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
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
        const delta = diff > 0 ? -1 : 1;
        this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + delta, 1);
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

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('cal-month-title').textContent = `${monthNames[month]} ${year}`;

    this.events = await API.get(`/events?month=${monthStr}`);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    let html = '';

    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrev - i;
      html += `<div class="cal-day other-month"><span class="cal-day-number">${day}</span></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === this.selectedDate;
      const dayEvents = this.events.filter(e => e.date === dateStr);

      const filteredEvents = App.selectedMemberId
        ? dayEvents.filter(e => !e.member_ids || e.member_ids.length === 0 || e.member_ids.includes(App.selectedMemberId))
        : dayEvents;

      const dots = filteredEvents.flatMap(e => {
        if (!e.members || e.members.length === 0) {
          return [`<span class="cal-dot" style="background:var(--accent)"></span>`];
        }
        return [e.members[0]].map(m =>
          `<span class="cal-dot" style="background:${m.color}"></span>`
        );
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

    const totalCells = firstDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
      html += `<div class="cal-day other-month"><span class="cal-day-number">${i}</span></div>`;
    }

    document.getElementById('cal-grid').innerHTML = html;

    document.querySelectorAll('.cal-day:not(.other-month)').forEach(el => {
      el.addEventListener('click', () => {
        this.selectedDate = el.dataset.date;
        this.render();
        this.showDetail(el.dataset.date);
      });
    });

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
      ? dayEvents.filter(e => !e.member_ids || e.member_ids.length === 0 || e.member_ids.includes(App.selectedMemberId))
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

    container.innerHTML = filtered.map(e => {
      const memberDisplay = e.members && e.members.length > 0
        ? e.members.map(m => `${m.emoji} ${m.name}`).join(', ')
        : '👨‍👩‍👧‍👦 Everyone';
      const eventColor = e.members && e.members.length > 0 ? e.members[0].color : 'var(--accent)';

      return `
        <div class="event-card" style="--event-color: ${eventColor}">
          <span class="event-icon">${e.icon || '📅'}</span>
          <div class="event-info">
            <div class="event-title">${escapeHtml(e.title)}</div>
            ${e.start_time ? `<div class="event-time">${formatTime(e.start_time)}${e.end_time ? ' - ' + formatTime(e.end_time) : ''}</div>` : ''}
            <div class="event-member">${memberDisplay}</div>
          </div>
          <div class="event-actions">
            <button class="event-action-btn" onclick="editEvent(${e.id})" title="Edit">✏️</button>
            <button class="event-action-btn" onclick="deleteEvent(${e.id})" title="Delete">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
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

  // Build multi-select member picker
  const select = document.getElementById('event-member-select');
  select.innerHTML = App.familyMembers.map(m => `
    <div class="member-option" data-id="${m.id}" style="--option-color: ${m.color}">
      <span>${m.emoji}</span> ${m.name}
    </div>
  `).join('') + `<div class="member-select-hint">No selection = Everyone</div>`;

  select.querySelectorAll('.member-option').forEach(opt => {
    opt.addEventListener('click', () => {
      opt.classList.toggle('selected');
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
    const selectedMembers = [...select.querySelectorAll('.member-option.selected')]
      .map(el => parseInt(el.dataset.id));
    const data = {
      title: document.getElementById('event-title').value,
      icon: Calendar.selectedEventIcon,
      date: document.getElementById('event-date').value,
      start_time: document.getElementById('event-start').value || null,
      end_time: document.getElementById('event-end').value || null,
      member_ids: selectedMembers,
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

  // Select members
  const memberIds = (event.member_ids || []).map(String);
  const select = document.getElementById('event-member-select');
  select.querySelectorAll('.member-option').forEach(o => {
    if (memberIds.includes(o.dataset.id)) {
      o.classList.add('selected');
    }
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
