// Dashboard module
const Dashboard = {
  async init() {
    await Promise.all([
      this.renderToday(),
      this.renderChoreProgress(),
      this.renderWeather(),
      this.renderLeaderboard()
    ]);
  },

  async renderToday() {
    const today = new Date().toISOString().split('T')[0];
    const events = await API.get(`/events?date=${today}`);
    const container = document.getElementById('widget-today-content');

    if (events.length === 0) {
      container.innerHTML = `
        <div class="widget-empty">
          <span class="widget-empty-icon">☀️</span>
          No events today
        </div>`;
      return;
    }

    container.innerHTML = events.map(e => `
      <div class="widget-event">
        <span class="widget-event-icon">${e.icon || '📅'}</span>
        <div class="widget-event-info">
          <div class="widget-event-title">${escapeHtml(e.title)}</div>
          <div class="widget-event-time">
            ${e.start_time ? formatTime(e.start_time) : 'All day'}
            ${e.members && e.members.length > 0 ? ` · ${e.members.map(m => m.emoji + ' ' + m.name).join(', ')}` : ''}
          </div>
        </div>
      </div>
    `).join('');
  },

  async renderChoreProgress() {
    const container = document.getElementById('widget-chore-content');
    const kids = App.familyMembers.filter(m => m.role === 'kid');
    const chores = await API.get('/chores');
    const today = new Date().toISOString().split('T')[0];
    const completions = await API.get(`/chores/status?date=${today}`);

    container.innerHTML = kids.map(kid => {
      const kidChores = chores.filter(c => !c.assigned_to || c.assigned_to === kid.id);
      const kidDone = completions.filter(c => c.member_id === kid.id).length;
      const total = kidChores.length;
      const pct = total > 0 ? Math.round((kidDone / total) * 100) : 0;

      return `
        <div class="widget-member-progress">
          <div class="widget-member-name">
            <span>${kid.emoji}</span> ${kid.name}
          </div>
          <div class="widget-progress-bar">
            <div class="widget-progress-fill" style="width: ${pct}%; background: ${kid.color}"></div>
          </div>
          <div class="widget-progress-text">${kidDone} / ${total} done</div>
        </div>
      `;
    }).join('');
  },

  async renderWeather() {
    const container = document.getElementById('widget-weather-content');
    try {
      const data = await API.get('/weather');
      if (!data.current) throw new Error('No data');

      const weatherCodes = {
        0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
        45: '🌫️', 48: '🌫️',
        51: '🌦️', 53: '🌦️', 55: '🌧️',
        61: '🌧️', 63: '🌧️', 65: '🌧️',
        71: '🌨️', 73: '🌨️', 75: '❄️',
        80: '🌦️', 81: '🌧️', 82: '⛈️',
        95: '⛈️', 96: '⛈️', 99: '⛈️'
      };

      const weatherNames = {
        0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
        45: 'Foggy', 48: 'Foggy', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
        61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
        71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
        80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
        95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm'
      };

      const code = data.current.weather_code;
      const temp = Math.round(data.current.temperature_2m);
      const icon = weatherCodes[code] || '🌡️';
      const desc = weatherNames[code] || 'Unknown';

      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const forecast = data.daily.time.slice(1, 4).map((date, i) => {
        const d = new Date(date + 'T12:00:00');
        const fCode = data.daily.weather_code[i + 1];
        return `
          <div class="forecast-day">
            <div class="forecast-label">${days[d.getDay()]}</div>
            <span class="forecast-icon">${weatherCodes[fCode] || '🌡️'}</span>
            <div class="forecast-temps">
              ${Math.round(data.daily.temperature_2m_max[i + 1])}° <span class="low">${Math.round(data.daily.temperature_2m_min[i + 1])}°</span>
            </div>
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <div class="weather-current">
          <span class="weather-icon">${icon}</span>
          <div>
            <div class="weather-temp">${temp}°F</div>
            <div class="weather-desc">${desc}</div>
          </div>
        </div>
        <div class="weather-forecast">${forecast}</div>
      `;
    } catch {
      container.innerHTML = `
        <div class="widget-empty">
          <span class="widget-empty-icon">🌡️</span>
          Weather unavailable
        </div>`;
    }
  },

  async renderLeaderboard() {
    const container = document.getElementById('widget-points-content');
    const kids = App.familyMembers.filter(m => m.role === 'kid');

    // Refresh member data
    const members = await API.get('/family');
    const kidData = members.filter(m => m.role === 'kid').sort((a, b) => b.total_points - a.total_points);

    container.innerHTML = kidData.map((kid, i) => `
      <div class="leaderboard-entry">
        <span class="leaderboard-emoji">${kid.emoji}</span>
        <div class="leaderboard-info">
          <div class="leaderboard-name">${i === 0 && kidData.length > 1 ? '👑 ' : ''}${kid.name}</div>
        </div>
        <div class="leaderboard-points">${kid.total_points} ⭐</div>
      </div>
    `).join('');
  }
};
