// ======================================
// DEAPS ADMIN ANALYTICS.JS v1.0
// Rating distribution, category performance, top bookmarked/rated styles, rating trend
// ======================================

document.addEventListener("DOMContentLoaded", () => {
    guardAdminAccess();
    loadStatCards();
    loadPlatformRatingDistribution();
    loadCategoryPerformance();
    loadMostBookmarked();
    loadTopRated();
    loadRatingsTrend();
    updateAuthArea();
});

// ======================================
// ACCESS GUARD (basic — requires login)
// ======================================

async function guardAdminAccess() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        window.location.href = 'index.html';
    }
}

// ======================================
// TOP STAT CARDS
// ======================================

async function loadStatCards() {
    const [
        { count: totalStyles },
        { count: totalRatings },
        { count: totalBookmarks },
        { data: avgData }
    ] = await Promise.all([
        supabaseClient.from('images').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabaseClient.from('ratings').select('id', { count: 'exact', head: true }),
        supabaseClient.from('favorites').select('id', { count: 'exact', head: true }),
        supabaseClient.from('images').select('avg_rating').eq('is_active', true).gt('total_ratings', 0)
    ]);

    const overallAvg = avgData && avgData.length
        ? (avgData.reduce((sum, r) => sum + (r.avg_rating || 0), 0) / avgData.length).toFixed(2)
        : '0.00';

    const cards = [
        { label: 'Total Active Styles', value: totalStyles || 0, icon: 'bi-image' },
        { label: 'Total Ratings Submitted', value: totalRatings || 0, icon: 'bi-star-fill' },
        { label: 'Total Bookmarks', value: totalBookmarks || 0, icon: 'bi-heart-fill' },
        { label: 'Platform Avg Rating', value: overallAvg, icon: 'bi-graph-up-arrow' }
    ];

    document.getElementById('statCardsRow').innerHTML = cards.map(c => `
        <div class="col-md-3">
            <div class="stat-card">
                <h3><i class="bi ${c.icon}"></i> ${c.value}</h3>
                <p>${c.label}</p>
            </div>
        </div>
    `).join('');
}

// ======================================
// PLATFORM-WIDE RATING DISTRIBUTION
// ======================================

async function loadPlatformRatingDistribution() {
    const container = document.getElementById('platformRatingDist');

    const { data, error } = await supabaseClient.from('ratings').select('rating');

    if (error || !data || !data.length) {
        container.innerHTML = `<p class="text-secondary small">No ratings submitted yet.</p>`;
        return;
    }

    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    data.forEach(r => { if (counts[r.rating] !== undefined) counts[r.rating]++; });
    const total = data.length;

    container.innerHTML = [5, 4, 3, 2, 1].map(star => {
        const pct = Math.round((counts[star] / total) * 100);
        return `
            <div class="bar-row">
                <span class="small text-secondary" style="width:36px;">${star}★</span>
                <div class="bar-track"><div class="bar-fill" style="width:${pct}%;"></div></div>
                <span class="small text-secondary" style="width:60px; text-align:right;">${counts[star]} (${pct}%)</span>
            </div>
        `;
    }).join('');
}

// ======================================
// CATEGORY PERFORMANCE
// ======================================

async function loadCategoryPerformance() {
    const container = document.getElementById('categoryPerformance');

    const { data: cats } = await supabaseClient
        .from('categories')
        .select('id, name')
        .eq('is_active', true);

    const { data: images } = await supabaseClient
        .from('images')
        .select('category_id, avg_rating, total_ratings, bookmark_count')
        .eq('is_active', true);

    if (!cats || !images) {
        container.innerHTML = `<p class="text-secondary small">No data available.</p>`;
        return;
    }

    const stats = cats.map(cat => {
        const items = images.filter(i => i.category_id === cat.id);
        const totalStyles = items.length;
        const avgRating = totalStyles
            ? (items.reduce((s, i) => s + (i.avg_rating || 0), 0) / totalStyles).toFixed(2)
            : '0.00';
        const totalBookmarks = items.reduce((s, i) => s + (i.bookmark_count || 0), 0);
        return { name: cat.name, totalStyles, avgRating, totalBookmarks };
    }).sort((a, b) => b.totalStyles - a.totalStyles);

    if (!stats.length) {
        container.innerHTML = `<p class="text-secondary small">No categories found.</p>`;
        return;
    }

    container.innerHTML = `
        <table class="table table-sm">
            <thead>
                <tr><th>Category</th><th>Styles</th><th>Avg Rating</th><th>Bookmarks</th></tr>
            </thead>
            <tbody>
                ${stats.map(s => `
                    <tr>
                        <td>${s.name}</td>
                        <td>${s.totalStyles}</td>
                        <td><i class="bi bi-star-fill text-warning"></i> ${s.avgRating}</td>
                        <td><i class="bi bi-heart-fill text-danger"></i> ${s.totalBookmarks}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// ======================================
// MOST BOOKMARKED STYLES
// ======================================

async function loadMostBookmarked() {
    const container = document.getElementById('mostBookmarked');

    const { data, error } = await supabaseClient
        .from('images')
        .select('id, title, category, bookmark_count, preview_url')
        .eq('is_active', true)
        .order('bookmark_count', { ascending: false })
        .limit(8);

    if (error || !data || !data.length) {
        container.innerHTML = `<p class="text-secondary small">No bookmark data yet.</p>`;
        return;
    }

    container.innerHTML = `
        <table class="table table-sm">
            <tbody>
                ${data.map((item, i) => `
                    <tr>
                        <td style="width:24px;">${i + 1}</td>
                        <td>${item.title}<br><span class="small text-secondary">${item.category || ''}</span></td>
                        <td class="text-end"><i class="bi bi-heart-fill text-danger"></i> ${item.bookmark_count || 0}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// ======================================
// TOP RATED STYLES (min 3 ratings to avoid skew)
// ======================================

async function loadTopRated() {
    const container = document.getElementById('topRated');

    const { data, error } = await supabaseClient
        .from('images')
        .select('id, title, category, avg_rating, total_ratings')
        .eq('is_active', true)
        .gte('total_ratings', 3)
        .order('avg_rating', { ascending: false })
        .limit(8);

    if (error || !data || !data.length) {
        container.innerHTML = `<p class="text-secondary small">Not enough rated styles yet (needs 3+ ratings).</p>`;
        return;
    }

    container.innerHTML = `
        <table class="table table-sm">
            <tbody>
                ${data.map((item, i) => `
                    <tr>
                        <td style="width:24px;">${i + 1}</td>
                        <td>${item.title}<br><span class="small text-secondary">${item.category || ''}</span></td>
                        <td class="text-end"><i class="bi bi-star-fill text-warning"></i> ${(item.avg_rating || 0).toFixed(1)} (${item.total_ratings})</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// ======================================
// RATINGS TREND (last 14 days, simple bar chart)
// ======================================

async function loadRatingsTrend() {
    const container = document.getElementById('ratingsTrend');

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const { data, error } = await supabaseClient
        .from('ratings')
        .select('created_at')
        .gte('created_at', fourteenDaysAgo.toISOString());

    if (error) {
        container.innerHTML = `<p class="text-secondary small">Could not load trend data.</p>`;
        return;
    }

    const dayBuckets = {};
    for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dayBuckets[key] = 0;
    }

    (data || []).forEach(r => {
        const key = r.created_at.slice(0, 10);
        if (dayBuckets[key] !== undefined) dayBuckets[key]++;
    });

    const maxVal = Math.max(...Object.values(dayBuckets), 1);

    container.innerHTML = `
        <div class="d-flex align-items-end gap-1" style="height:100px;">
            ${Object.entries(dayBuckets).map(([day, count]) => {
                const heightPct = Math.max((count / maxVal) * 100, 3);
                const label = day.slice(5);
                return `
                    <div class="flex-grow-1 text-center" title="${label}: ${count} ratings">
                        <div style="background:#D4AF37; height:${heightPct}%; border-radius:3px 3px 0 0;"></div>
                        <div class="small text-secondary mt-1" style="font-size:0.65rem;">${label}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ======================================
// AUTH AREA (navbar)
// ======================================

async function updateAuthArea() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const authArea = document.getElementById('authArea');

    if (user) {
        authArea.innerHTML = `
            <span class="text-white small me-2">${user.email}</span>
            <button class="btn btn-outline-light btn-sm" id="logoutBtn">Logout</button>
        `;
        document.getElementById('logoutBtn').addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            window.location.href = 'index.html';
        });
    } else {
        authArea.innerHTML = `<a href="index.html" class="btn btn-outline-warning btn-sm">Login</a>`;
    }
}

console.log("Admin Analytics Loaded Successfully (v1.0)");