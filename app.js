// ===== STATE =====
let state = {
    user: null,
    cart: [],
    wishlist: [],
    orders: [],
    currentProduct: null,
    currentCategory: null,
    searchQuery: '',
    currentSlide: 0,
    productQty: 1,
    selectedOptions: {},
    sortBy: 'popular',
    displayedCount: 10,
    paymentMethod: 'card',
    shippingMethod: 'standard',
    appliedCoupon: null,
    orderFilter: 'all',
    lastViewedShop: '',
    banners: [
        { id: 1, badge: '🔥 Sale สูงสุด 90%', title: 'Flash Sale วันนี้เท่านั้น!', desc: 'สินค้าลดราคาสูงสุด ส่งฟรีทั่วประเทศ', btnText: 'ช้อปเลย →', cat: 'flash', visual: '🛒' },
        { id: 2, badge: '📱 New Arrival', title: 'สมาร์ทโฟนรุ่นใหม่มาแล้ว!', desc: 'เทคโนโลยีล้ำสมัย ราคาสุดคุ้ม', btnText: 'ดูสินค้า →', cat: 'electronics', visual: '📱' },
        { id: 3, badge: '👗 Fashion Week', title: 'เสื้อผ้าสไตล์ใหม่ล่าสุด', desc: 'ตามทันทุกเทรนด์แฟชั่น 2025', btnText: 'ช้อปแฟชั่น →', cat: 'fashion', visual: '👗' }
    ]
};

// ===== USERS (Persistence) =====
let USERS = [];
function loadUsers() {
    const saved = localStorage.getItem('shopnow_users');
    USERS = saved ? JSON.parse(saved) : [];
}
function saveUsers() {
    localStorage.setItem('shopnow_users', JSON.stringify(USERS));
}

// ===== SELLER STATE (Hoisted for Global Access) =====
let sellerProducts = [];
let editingProductId = null;
let selectedEmoji = '📦';

// ===== INIT =====
// ✅ เริ่มต้นโหลดข้อมูล (เปลี่ยนเป็น async เพื่อรอ Supabase)
document.addEventListener('DOMContentLoaded', async () => {
    updateCloudStatus('connecting');
    loadUsers();
    loadFromStorage();

    // เคลียร์สินค้าเดิมออกให้หมด เพื่อรอข้อมูลจริงจาก Cloud
    PRODUCTS.length = 0;

    // ☁️ ย้ายข้อมูลเดิมขึ้น Cloud (ถ้ามีและยังไม่ได้ย้าย)
    await migrateToCloud();

    await initSellerProducts(); // ← โหลดสินค้าออนไลน์มารวมกับรายการหลัก
    loadStockFromStorage();

    // ☁️ ตรวจสอบสถานะการเชื่อมต่อ
    const online = await isOnline();
    updateCloudStatus(online ? 'connected' : 'offline');

    // ☁️ ดึงออเดอร์ออนไลน์ (ถ้าล็อกอินใช้ Cloud เป็นหลักเพื่อล้างข้อมูลปนกันในเครื่อง)
    if (state.user) {
        state.orders = await fetchOnlineOrders();
        saveToStorage();
    }

    // ☁️ ดึงแบนเนอร์และคูปองจาก Cloud
    const cloudBanners = await fetchOnlineBanners();
    if (cloudBanners.length > 0) state.banners = cloudBanners;

    const cloudVouchers = await fetchOnlineVouchers();
    if (cloudVouchers.length > 0) state.vouchers = cloudVouchers;

    renderFlashProducts();
    renderFeaturedProducts();
    renderNewProducts();
    renderAllProducts();
    updateCartBadge();
    startCountdown();
    startSlider();
    initSearch();
    renderVouchers();

    if (state.currentPage === 'product' && state.currentProduct) {
        viewProduct(state.currentProduct.id);
    } else {
        openPage(state.currentPage || 'home');
    }

    // ✅ เพิ่มระบบ Sync ข้อมูลอัตโนมัติ (ข้ามแท็บ)
    window.addEventListener('storage', (e) => {
        if (e.key === 'shopnow_stock' || e.key === 'shopnow_seller_products' || e.key === 'shopnow_state' || e.key === 'shopnow_users') {
            if (e.key === 'shopnow_users') loadUsers(); // โหลดลิสต์สมาชิกใหม่
            loadStockFromStorage();
            initSellerProducts();
            if (e.key === 'shopnow_state') loadFromStorage(); // โหลดออเดอร์/User ใหม่
            refreshCurrentView();
            // ถ้าอยู่ในหน้าโปรไฟล์ ให้เรนเดอร์ใหม่ด้วย
            if (state.currentPage === 'profile') renderProfile();
            if (state.currentPage === 'orders') renderOrders();
        }
    });
});

function updateCloudStatus(status) {
    const el = document.getElementById('cloud-status');
    if (!el) return;
    if (status === 'connected') {
        el.innerHTML = '<span style="width:6px; height:6px; background:#2ecc71; border-radius:50%; box-shadow:0 0 5px #2ecc71"></span> Online (Cloud Sync)';
        el.style.color = 'rgba(255,255,255,0.8)';
    } else if (status === 'connecting') {
        el.innerHTML = '<span style="width:6px; height:6px; background:#f1c40f; border-radius:50%"></span> Connecting...';
    } else {
        el.innerHTML = '<span style="width:6px; height:6px; background:#e74c3c; border-radius:50%"></span> Offline Mode';
    }
}

// ฟังก์ชันสำหรับ Refresh ข้อมูลในหน้าปัจจุบัน
function refreshCurrentView() {
    const page = state.currentPage;
    if (page === 'home') {
        renderFlashProducts(); renderFeaturedProducts(); renderNewProducts(); renderAllProducts();
    } else if (page === 'search') {
        // อัปเดตผลการค้นหา/หมวดหมู่เดิม
        if (state.currentCategory) filterCategory(state.currentCategory);
        else if (state.searchQuery) {
            // เรียก doSearch แบบไม่ขยับหน้าจอ
            const results = PRODUCTS.filter(p => p.name.toLowerCase().includes(state.searchQuery.toLowerCase()) || p.category.includes(state.searchQuery.toLowerCase()));
            renderSearchResults(results);
        }
    } else if (page === 'product' && state.currentProduct) {
        // อัปเดตสต็อกในหน้าสินค้า
        const updated = PRODUCTS.find(p => p.id === state.currentProduct.id);
        if (updated) viewProduct(updated.id);
    } else if (page === 'shop' && state.lastViewedShop) {
        viewShop(state.lastViewedShop);
    } else if (page === 'seller-dash') {
        sdTab(state.sellerTab);
    } else if (page === 'cart') {
        renderCart();
    }
}

async function initSellerProducts() {
    // 1. นำเอาสิ่งทีแอดมินแก้ไข (เช่น ติด Tag Flash) มาทับสินค้าหลัก
    const savedAdminUpdates = localStorage.getItem('shopnow_product_updates');
    if (savedAdminUpdates) {
        const updates = JSON.parse(savedAdminUpdates);
        updates.forEach(up => {
            const idx = PRODUCTS.findIndex(p => String(p.id) === String(up.id));
            if (idx >= 0) Object.assign(PRODUCTS[idx], up);
        });
    }

    // 2. ☁️ ดึงสินค้าจาก Supabase
    const onlineProducts = await fetchOnlineProducts();
    if (onlineProducts.length > 0) {
        sellerProducts = onlineProducts;
    } else {
        // Fallback: ถ้าเน็ตหลุดหรือไม่มีใน Cloud ให้ใช้ Local ไปก่อน (สำหรับช่วงทรานสิชัน)
        const savedSeller = localStorage.getItem('shopnow_seller_products');
        if (savedSeller) sellerProducts = JSON.parse(savedSeller);
    }

    // รวมเข้า PRODUCTS หลัก
    sellerProducts.forEach(sp => {
        const sid = String(sp.id);
        const idx = PRODUCTS.findIndex(p => String(p.id) === sid);
        if (idx >= 0) {
            Object.assign(PRODUCTS[idx], sp);
        } else {
            PRODUCTS.push(sp);
        }
    });
}

function loadFromStorage() {
    const saved = localStorage.getItem('shopnow_state');
    if (saved) {
        const s = JSON.parse(saved);
        state.cart = s.cart || [];
        state.wishlist = s.wishlist || [];
        state.orders = s.orders || [];
        state.user = s.user || null;
        if (state.user && state.user.email) {
            const lowEmail = state.user.email.toLowerCase();
            if (lowEmail === 'houseofstamp@gmail.com' || lowEmail.includes('admin')) {
                state.user.isAdmin = true;
            }
        }
        state.currentPage = s.currentPage || 'home';
        state.sellerTab = s.sellerTab || 'overview';
        state.adminTab = s.adminTab || 'banners';
        state.banners = s.banners || state.banners;
        state.vouchers = (s.vouchers && s.vouchers.length > 0) ? s.vouchers : [...VOUCHERS];
        state.currentProduct = s.currentProduct || null;

        // ✅ ตรวจสอบว่า User ปัจจุบันอยู่ในลิสต์ USERS หรือไม่
        if (state.user) {
            // มั่นใจว่าต้องมี ID (ถ้าคนเก่าไม่มี ให้สร้างให้เดี๋ยวนี้)
            if (!state.user.id) state.user.id = Date.now();

            const existsIdx = USERS.findIndex(u =>
                u.id === state.user.id ||
                (state.user.phone && u.phone === state.user.phone) ||
                (state.user.email && u.email === state.user.email)
            );

            if (existsIdx === -1) {
                // ถ้าไม่มีในถังเลย ให้เพิ่มเข้าไป
                USERS.push(state.user);
                saveUsers();
            } else {
                // ถ้ามีแล้ว แต่ข้อมูลในถังใหญ่เก่ากว่า ให้เอาค่าจาก state.user ทับลงไป
                // (เผื่อกรณีระบบผิดพลาด ข้อมูลจะได้ Sync กันตลอด)
                if (JSON.stringify(USERS[existsIdx]) !== JSON.stringify(state.user)) {
                    USERS[existsIdx] = { ...state.user };
                    saveUsers();
                }
            }
        }

        updateUserUI();
    }
}

function saveToStorage() {
    localStorage.setItem('shopnow_state', JSON.stringify({
        cart: state.cart,
        wishlist: state.wishlist,
        orders: state.orders,
        user: state.user,
        currentPage: state.currentPage,
        sellerTab: state.sellerTab,
        adminTab: state.adminTab,
        banners: state.banners,
        vouchers: state.vouchers,
        currentProduct: state.currentProduct,
    }));
}

// ===== STOCK PERSISTENCE =====
// บันทึก stock/sold ของทุกสินค้าที่เคยถูกตัดลง localStorage
function saveStockToStorage() {
    const stockMap = {};
    PRODUCTS.forEach(p => {
        stockMap[p.id] = { stock: p.stock, sold: p.sold };
    });
    localStorage.setItem('shopnow_stock', JSON.stringify(stockMap));
}

// โหลด stock/sold กลับมาแพทช์ใน PRODUCTS array ทุกครั้งที่เปิดหน้า
function loadStockFromStorage() {
    const saved = localStorage.getItem('shopnow_stock');
    if (!saved) return;
    const stockMap = JSON.parse(saved);
    PRODUCTS.forEach(p => {
        const entry = stockMap[String(p.id)];
        if (entry !== undefined) {
            p.stock = entry.stock;
            p.sold = entry.sold;
        }
    });
}

// ===== PAGES =====
function openPage(page) {
    // เช็คสิทธิ์เข้าถึงหน้า seller-dash
    if (page === 'seller-dash' && !state.user) {
        page = 'home';
    }
    // เช็คสิทธิ์เข้าถึงหน้า admin-dash
    if (page === 'admin-dash' && (!state.user || !state.user.isAdmin)) {
        page = 'home';
    }

    state.currentPage = page;
    saveToStorage();

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('page-' + page);
    if (el) {
        el.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (page === 'home') {
        renderHomeBanners();
        renderFlashProducts(); renderFeaturedProducts(); renderNewProducts(); renderAllProducts();
    }
    if (page === 'cart') renderCart();
    if (page === 'orders') renderOrders();
    if (page === 'wishlist') renderWishlist();
    if (page === 'profile') renderProfile();
    if (page === 'checkout') renderCheckout();
    if (page === 'admin-dash') {
        if (!state.user?.isAdmin) { openPage('home'); return; }
        admTab(state.adminTab || 'banners');
    }

    if (page === 'seller-dash') {
        // อัปเดตชื่อร้านค้าในหน้า Dash
        const shopNameEl = document.getElementById('sd-shop-name');
        if (shopNameEl && state.user) {
            shopNameEl.textContent = (state.user.shopName || state.user.name + "'s Shop");
        }
        sdTab(state.sellerTab || 'overview');
    }
}

// ===== SLIDER =====
let sliderInterval;
function startSlider() {
    if (sliderInterval) clearInterval(sliderInterval);
    sliderInterval = setInterval(() => changeSlide(1), 4000);
}
function changeSlide(dir) {
    const total = state.banners.length;
    if (total === 0) return;
    state.currentSlide = (state.currentSlide + dir + total) % total;
    updateSlider();
}
function goSlide(i) {
    state.currentSlide = i;
    updateSlider();
    clearInterval(sliderInterval);
    startSlider();
}
function updateSlider() {
    const slides = document.getElementById('hero-slides');
    const total = state.banners.length;
    if (slides) slides.style.transform = `translateX(-${state.currentSlide * (100 / total)}%)`;
    document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === state.currentSlide));
}

function renderHomeBanners() {
    const slidesContainer = document.getElementById('hero-slides');
    const dotsContainer = document.getElementById('slide-dots');
    if (!slidesContainer || !dotsContainer) return;

    if (state.banners.length === 0) {
        slidesContainer.innerHTML = `<div class="slide slide-1"><div class="slide-content"><h1>ต้อนรับสู่ ShopNow</h1></div></div>`;
        dotsContainer.innerHTML = '';
        return;
    }

    slidesContainer.style.width = `${state.banners.length * 100}%`;
    slidesContainer.innerHTML = state.banners.map((b, i) => `
        <div class="slide slide-${(i % 3) + 1}">
            <div class="slide-content">
                <div class="slide-badge">${b.badge}</div>
                <h1>${b.title}</h1>
                <p>${b.desc}</p>
                <button class="btn-slide" onclick="filterCategory('${b.cat}')">${b.btnText}</button>
            </div>
            <div class="slide-visual" style="font-size:120px">${b.visual}</div>
        </div>
    `).join('');

    dotsContainer.innerHTML = state.banners.map((_, i) => `
        <span class="dot${i === 0 ? ' active' : ''}" onclick="goSlide(${i})"></span>
    `).join('');

    state.currentSlide = 0;
    updateSlider();
    startSlider();
}

// ===== COUNTDOWN =====
function startCountdown() {
    let total = 2 * 3600 + 45 * 60 + 30;
    setInterval(() => {
        total = Math.max(0, total - 1);
        const h = String(Math.floor(total / 3600)).padStart(2, '0');
        const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
        const s = String(total % 60).padStart(2, '0');
        const ch = document.getElementById('cd-h');
        const cm = document.getElementById('cd-m');
        const cs = document.getElementById('cd-s');
        if (ch) ch.textContent = h;
        if (cm) cm.textContent = m;
        if (cs) cs.textContent = s;
    }, 1000);
}

// ===== PRODUCT CARD =====
function productCard(p, isRow = false) {
    const liked = state.wishlist.includes(p.id);
    const discount = p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
    const imgUrl = (p.images && p.images[0]) || p.image;
    return `
  <div class="product-card${isRow ? ' row-card' : ''}" id="pcard-${p.id}">
    <div class="product-img-wrap" onclick="viewProduct(${p.id})">
      <div class="product-emoji">
        ${imgUrl ? `<img src="${imgUrl}" style="width:100%; height:100%; object-fit:cover">` : p.emoji}
      </div>
      ${p.badge ? `<span class="product-badge badge-${p.badge}">${p.badge === 'new' ? 'ใหม่' : p.badge === 'hot' ? '🔥ฮิต' : `ลด${discount}%`}</span>` : ''}
      <button class="product-wishlist${liked ? ' liked' : ''}" onclick="toggleWishlist(event,${p.id})">${liked ? '❤️' : '🤍'}</button>
      <div class="add-to-cart-overlay" onclick="addToCart(event,${p.id})">🛒 เพิ่มลงตะกร้า</div>
    </div>
    <div class="product-body" onclick="viewProduct(${p.id})">
      <div class="product-name">${p.name}</div>
      <div class="product-rating">
        <span class="stars">★</span>
        <span>${p.rating}</span>
        <span class="sold">| ขายแล้ว ${(() => {
            const realSales = state.orders ? state.orders.reduce((sum, order) => {
                const matches = order.items?.filter(i => String(i.id) === String(p.id)) || [];
                return sum + matches.reduce((s, m) => s + m.qty, 0);
            }, 0) : 0;
            return formatNum((p.sold || 0) + realSales);
        })()}</span>
      </div>
      <div class="product-price">
        <span class="price-current">฿${formatNum(p.price)}</span>
        ${p.originalPrice ? `<span class="price-original">฿${formatNum(p.originalPrice)}</span><span class="discount-tag">-${discount}%</span>` : ''}
      </div>
      <div class="product-shop">
        ${p.shopBadge ? `<span class="shop-badge">${p.shopBadge}</span>` : ''}${p.shop}
      </div>
    </div>
  </div>`;
}

function renderFlashProducts() {
    const el = document.getElementById('flash-products');
    if (!el) return;
    const flash = PRODUCTS.filter(p => p.tags.includes('flash')).slice(0, 8);
    el.innerHTML = flash.map(p => productCard(p, true)).join('');
}

function renderFeaturedProducts() {
    const el = document.getElementById('featured-products');
    if (!el) return;
    const top = PRODUCTS.filter(p => p.tags.includes('top')).slice(0, 10);
    el.innerHTML = top.map(p => productCard(p)).join('');
}

function renderNewProducts() {
    const el = document.getElementById('new-products');
    if (!el) return;
    const newP = PRODUCTS.filter(p => p.tags.includes('new')).slice(0, 10);
    el.innerHTML = newP.map(p => productCard(p)).join('');
}

function renderAllProducts() {
    const el = document.getElementById('all-products');
    if (!el) return;
    const all = PRODUCTS.slice(0, state.displayedCount);
    el.innerHTML = all.map(p => productCard(p)).join('');
    const btn = document.getElementById('load-more-btn');
    if (btn) btn.style.display = state.displayedCount >= PRODUCTS.length ? 'none' : 'inline-block';
}

function loadMore() {
    state.displayedCount += 10;
    renderAllProducts();
}

// ===== PRODUCT DETAIL =====
function viewProduct(id) {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    state.currentProduct = p;
    state.productQty = 1;
    state.selectedOptions = {};
    openPage('product');

    document.getElementById('product-breadcrumb').innerHTML =
        `<a href="#" onclick="openPage('home')">หน้าหลัก</a> › <a href="#" onclick="filterCategory('${p.category}')">${getCatName(p.category)}</a> › ${p.name.substring(0, 40)}...`;

    const pImages = (p.images && p.images.length > 0) ? p.images : (p.image ? [p.image] : []);
    const mainImg = pImages[0] || null;

    document.getElementById('product-main-image').innerHTML = mainImg
        ? `<img src="${mainImg}" style="width:100%; height:100%; object-fit:contain">`
        : `<div style="font-size:120px">${p.emoji}</div>`;

    document.getElementById('product-thumbnails').innerHTML =
        [...pImages, p.emoji, p.emoji, p.emoji].slice(0, 4).map((item, i) => {
            const isImg = item && (String(item).startsWith('data:') || String(item).startsWith('http'));
            return `<div class="thumb${i === 0 ? ' active' : ''}" onclick="selectThumb(this)">
                ${isImg ? `<img src="${item}" style="width:100%; height:100%; object-fit:cover">` : `<span style="font-size:20px">${item || p.emoji}</span>`}
            </div>`;
        }).join('');

    const discount = p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
    const liked = state.wishlist.includes(p.id);
    document.getElementById('product-info').innerHTML = `
    <h1>${p.name}</h1>
    <div class="rating-row">
      <span class="stars">★ ${p.rating}</span>
      <span style="color:var(--text-3)">รีวิว ${p.reviews.length} รายการ</span>
      <span style="color:var(--text-3)">ขายแล้ว ${formatNum(p.sold)}</span>
      <button onclick="toggleWishlist(event,${p.id})" style="margin-left:auto;font-size:20px">${liked ? '❤️' : '🤍'}</button>
    </div>
    <div class="price-box">
      <span class="info-price">฿${formatNum(p.price)}</span>
      ${p.originalPrice ? `<span class="info-price-orig">฿${formatNum(p.originalPrice)}</span><span class="info-discount">-${discount}%</span>` : ''}
    </div>
    <div class="option-label">${p.optionTitle || 'สี / รุ่น'}</div>
    <div class="options-row">
      ${(p.options && p.options.length > 0 ? p.options : ['ดำ', 'ขาว', 'เงิน', 'ทอง']).map((c, i) => `<button class="option-btn${i === 0 ? ' active' : ''}" onclick="selectOption(this,'color','${c}')">${c}</button>`).join('')}
    </div>
    <div class="option-label">จำนวน</div>
    <div class="qty-row">
      <div class="qty-control">
        <button class="qty-btn" onclick="changeQty(-1)">−</button>
        <input class="qty-input" id="qty-input" value="1" readonly />
        <button class="qty-btn" onclick="changeQty(1)">+</button>
      </div>
      <span class="stock-info">มีสินค้า ${p.stock} ชิ้น</span>
    </div>
    <div class="action-row">
      <button class="btn-add-cart" onclick="addToCartFromDetail()">🛒 เพิ่มลงตะกร้า</button>
      <button class="btn-buy-now" onclick="buyNow()">⚡ ซื้อเลย</button>
    </div>
    <div class="shop-info-box">
      <div class="shop-avatar">🏪</div>
      <div style="flex:1">
        <div class="shop-name">${p.shop}</div>
        <div class="shop-stats">
            ★ ${(() => {
            const sp = PRODUCTS.filter(x => x.shop === p.shop);
            return (sp.reduce((s, x) => s + x.rating, 0) / sp.length).toFixed(1);
        })()} | ตอบแชท 100% | สินค้า ${formatNum(PRODUCTS.filter(x => x.shop === p.shop).length)} รายการ
        </div>
      </div>
      <button class="btn-visit-shop" onclick="viewShop('${p.shop}')">ดูร้านค้า</button>
    </div>
    <div class="delivery-row">🚚 <strong>จัดส่งฟรี</strong> — คาดการณ์รับสินค้า 2-3 วัน</div>
    <div class="delivery-row">🛡️ <strong>รับประกัน</strong> — คืนสินค้าภายใน 15 วัน</div>`;

    document.getElementById('review-count').textContent = p.reviews.length;
    document.getElementById('tab-desc').innerHTML = `<p style="line-height:1.8;color:var(--text-2)">${p.desc}</p>`;
    document.getElementById('tab-specs').innerHTML = `<table style="width:100%;border-collapse:collapse">${Object.entries(p.specs).map(([k, v]) => `<tr><td style="padding:10px 16px;border-bottom:1px solid var(--border);color:var(--text-3);width:40%">${k}</td><td style="padding:10px 16px;border-bottom:1px solid var(--border)">${v}</td></tr>`).join('')}</table>`;
    document.getElementById('tab-reviews').innerHTML = p.reviews.length
        ? p.reviews.map(r => `<div style="padding:16px 0;border-bottom:1px solid var(--border)"><div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><strong>${r.user}</strong><span style="color:var(--gold)">${'★'.repeat(r.rating)}</span><span style="color:var(--text-3);font-size:12px">${r.date}</span></div><p>${r.comment}</p></div>`).join('')
        : '<div class="empty-state"><div class="empty-icon">⭐</div><p>ยังไม่มีรีวิวสินค้านี้</p></div>';

    const related = PRODUCTS.filter(x => x.category === p.category && x.id !== p.id).slice(0, 6);
    document.getElementById('related-products').innerHTML = related.map(x => productCard(x, true)).join('');
}

function selectThumb(el) {
    document.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    const main = document.getElementById('product-main-image');
    if (main) {
        main.innerHTML = el.innerHTML;
        // ปรับขนาดถ้าเป็นอิโมจิ
        const span = main.querySelector('span');
        if (span) span.style.fontSize = '120px';
    }
}

function selectOption(el, type, val) {
    el.closest('.options-row').querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    state.selectedOptions[type] = val;

    // 💰 อัปเดตราคาตามตัวเลือก (Variations)
    const p = state.currentProduct;
    if (p && p.variations) {
        const variation = p.variations.find(v => v.name === val);
        if (variation) {
            const priceEl = document.querySelector('.info-price');
            const origEl = document.querySelector('.info-price-orig');
            const discEl = document.querySelector('.info-discount');

            if (priceEl) priceEl.textContent = `฿${formatNum(variation.price)}`;

            // ปรับส่วนลด (ถ้ามี)
            if (p.originalPrice && origEl) {
                // คำนวณส่วนลดใหม่ตามสัดส่วนเดิม หรือซ่อนถ้าราคา variation สูงกว่า
                const ratio = p.price / p.originalPrice;
                const newOrig = Math.round(variation.price / ratio);
                origEl.textContent = `฿${formatNum(newOrig)}`;
            }
        }
    }
}

function changeQty(d) {
    const p = state.currentProduct;
    state.productQty = Math.max(1, Math.min(p.stock, state.productQty + d));
    const input = document.getElementById('qty-input');
    if (input) input.value = state.productQty;
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    event.currentTarget.classList.add('active');
    document.getElementById('tab-' + tab).classList.remove('hidden');
}

// ===== CART =====
function addToCart(e, id) {
    e.stopPropagation();
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    const existing = state.cart.find(c => c.id === id && c.variant === 'ค่าเริ่มต้น');
    if (existing) existing.qty++;
    else state.cart.push({ id, qty: 1, variant: 'ค่าเริ่มต้น', price: p.price });
    updateCartBadge();
    saveToStorage();
    showToast('success', `🛒 เพิ่ม "${p.name.substring(0, 20)}..." ลงตะกร้าแล้ว`);
}

function addToCartFromDetail() {
    const p = state.currentProduct;
    if (!p) return;
    // หาว่าตัวเลือกที่เลือกอยู่ มีราคาเท่าไหร่
    let currentPrice = p.price;
    const selectedVariant = state.selectedOptions.color || 'ค่าเริ่มต้น';
    if (p.variations) {
        const v = p.variations.find(x => x.name === selectedVariant);
        if (v) currentPrice = v.price;
    }

    const existing = state.cart.find(c => c.id === p.id && c.variant === selectedVariant);
    if (existing) {
        existing.qty += state.productQty;
        existing.price = currentPrice; // อัปเดตราคาให้เป็นปัจจุบัน
    } else {
        state.cart.push({
            id: p.id,
            qty: state.productQty,
            variant: selectedVariant,
            price: currentPrice
        });
    }
    updateCartBadge();
    saveToStorage();
    showToast('success', `🛒 เพิ่มสินค้า ${state.productQty} ชิ้นลงตะกร้าแล้ว`);
}

function buyNow() {
    addToCartFromDetail();
    openPage('checkout');
}

function updateCartBadge() {
    const total = state.cart.reduce((s, c) => s + c.qty, 0);
    const badge = document.getElementById('cart-badge');
    if (badge) badge.textContent = total;
}

function renderCart() {
    const el = document.getElementById('cart-items');
    const sumEl = document.getElementById('cart-summary');
    if (!el || !sumEl) return;

    if (state.cart.length === 0) {
        el.innerHTML = `<div class="empty-state"><div class="empty-icon">🛒</div><h3>ตะกร้าของคุณว่างเปล่า</h3><p>เพิ่มสินค้าที่ชอบลงตะกร้าได้เลย</p><button class="btn-primary" style="display:inline-block;padding:12px 32px;border-radius:8px;margin-top:12px" onclick="openPage('home')">ช้อปเลย</button></div>`;
        sumEl.innerHTML = '';
        return;
    }

    el.innerHTML = `
    <div class="cart-header">
      <div></div><div>สินค้า</div><div>ราคา</div><div>จำนวน</div><div>รวม</div><div></div>
    </div>
    ${state.cart.map(c => {
        const p = PRODUCTS.find(x => x.id === c.id);
        if (!p) return '';
        const price = c.price || p.price;
        return `<div class="cart-item">
        <div style="font-size:11px;color:var(--text-3)"><input type="checkbox" checked style="width:16px;height:16px"></div>
        <div style="display:flex;gap:12px;align-items:center">
          <div class="cart-item-img" onclick="viewProduct(${p.id})" style="cursor:pointer">${p.emoji}</div>
          <div><div class="product-name" style="max-width:200px;cursor:pointer" onclick="viewProduct(${p.id})">${p.name}</div><div class="cart-item-variant">ตัวเลือก: ${c.variant}</div></div>
        </div>
        <div class="cart-item-price">฿${formatNum(price)}</div>
        <div class="cart-item-qty">
          <button class="cart-qty-btn" onclick="updateCartQty(${p.id},'${c.variant}',-1)">−</button>
          <span class="cart-qty-num">${c.qty}</span>
          <button class="cart-qty-btn" onclick="updateCartQty(${p.id},'${c.variant}',1)">+</button>
        </div>
        <div class="cart-item-total">฿${formatNum(price * c.qty)}</div>
        <button class="cart-delete" onclick="removeFromCart(${p.id},'${c.variant}')">🗑️</button>
      </div>`;
    }).join('')}`;

    renderCartSummary(sumEl);
}

function updateCartQty(id, variant, d) {
    const c = state.cart.find(x => x.id === id && x.variant === variant);
    if (!c) return;
    c.qty = Math.max(1, c.qty + d);
    saveToStorage();
    updateCartBadge();
    renderCart();
}

function removeFromCart(id, variant) {
    state.cart = state.cart.filter(c => !(c.id === id && c.variant === variant));
    saveToStorage();
    updateCartBadge();
    renderCart();
    showToast('', '🗑️ ลบสินค้าออกจากตะกร้าแล้ว');
}

function renderCartSummary(el) {
    const subtotal = state.cart.reduce((s, c) => {
        const p = PRODUCTS.find(x => x.id === c.id);
        const price = c.price || (p ? p.price : 0);
        return s + (price * c.qty);
    }, 0);
    const shipping = subtotal >= 199 ? 0 : 40;
    const couponDiscount = state.appliedCoupon ? state.appliedCoupon.discount : 0;
    const total = subtotal + shipping - couponDiscount;

    el.innerHTML = `
    <h3>สรุปคำสั่งซื้อ</h3>
    <div class="summary-row"><span>ราคาสินค้า</span><span>฿${formatNum(subtotal)}</span></div>
    <div class="summary-row"><span>ค่าจัดส่ง</span><span style="color:${shipping === 0 ? '#2ecc71' : 'inherit'}">${shipping === 0 ? 'ฟรี' : '฿' + shipping}</span></div>
    ${state.appliedCoupon ? `<div class="summary-row" style="color:var(--primary)"><span>โค้ดส่วนลด</span><span>-฿${couponDiscount}</span></div>` : ''}
    <div class="coupon-input">
      <input type="text" id="coupon-code" placeholder="กรอกโค้ดส่วนลด" />
      <button class="btn-coupon" onclick="applyCoupon()">ใช้</button>
    </div>
    <div class="summary-row total"><span>ยอดรวม</span><span>฿${formatNum(total)}</span></div>
    <button class="btn-checkout" onclick="openPage('checkout')">ชำระเงิน (${state.cart.reduce((s, c) => s + c.qty, 0)} ชิ้น)</button>`;
}

function applyCoupon(forcedCode) {
    const code = forcedCode || document.getElementById('coupon-code')?.value.trim().toUpperCase();
    if (!code) { showToast('error', '❌ กรุณากรอกโค้ดส่วนลด'); return; }

    const list = state.vouchers || VOUCHERS;
    const v = list.find(x => x.code === code);

    if (!v) {
        showToast('error', '❌ ไม่พบโค้ดส่วนลดนี้');
        return;
    }

    // คำนวณยอดรวมปัจจุบันเพื่อเช็คขั้นต่ำ
    const subtotal = state.cart.reduce((s, c) => {
        const p = PRODUCTS.find(x => x.id === c.id);
        return s + (p ? p.price * c.qty : 0);
    }, 0);

    if (subtotal < v.minOrder) {
        showToast('error', `❌ ยอดซื้อขั้นต่ำไม่ถึง ฿${v.minOrder} (มียอด ฿${subtotal})`);
        return;
    }

    state.appliedCoupon = v;
    showToast('success', `🎉 ใช้โค้ด ${v.code} ลด ฿${v.discount} สำเร็จ!`);

    if (state.currentPage === 'cart') renderCart();
    closeModal('voucher-modal');
}

// ===== WISHLIST =====
function toggleWishlist(e, id) {
    e.stopPropagation();
    if (state.wishlist.includes(id)) {
        state.wishlist = state.wishlist.filter(x => x !== id);
        showToast('', '💔 ลบออกจากรายการโปรดแล้ว');
    } else {
        state.wishlist.push(id);
        showToast('success', '❤️ เพิ่มลงรายการโปรดแล้ว');
    }
    saveToStorage();
    document.querySelectorAll(`#pcard-${id} .product-wishlist`).forEach(btn => {
        btn.textContent = state.wishlist.includes(id) ? '❤️' : '🤍';
        btn.classList.toggle('liked', state.wishlist.includes(id));
    });
}

function renderWishlist() {
    const el = document.getElementById('wishlist-grid');
    if (!el) return;
    if (state.wishlist.length === 0) {
        el.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">❤️</div><h3>ยังไม่มีสินค้าในรายการโปรด</h3><p>กดหัวใจที่สินค้าเพื่อเพิ่มลงรายการโปรด</p></div>`;
        return;
    }
    const items = PRODUCTS.filter(p => state.wishlist.includes(p.id));
    el.innerHTML = items.map(p => productCard(p)).join('');
}

// ===== CATEGORIES / SEARCH =====
function filterCategory(cat) {
    state.currentCategory = cat;
    state.searchQuery = '';
    openPage('search');
    const catNames = { flash: 'Flash Sale ⚡', top: 'สินค้ายอดนิยม 🏆', new: 'สินค้าใหม่ ✨', electronics: 'อิเล็กทรอนิกส์ 📱', fashion: 'เสื้อผ้าและแฟชั่น 👗', beauty: 'ความงามและสุขภาพ 💄', home: 'บ้านและสวน 🏡', sports: 'กีฬาและกลางแจ้ง ⚽', food: 'อาหารและเครื่องดื่ม 🍜', toys: 'ของเล่น 🧸', books: 'หนังสือ 📚', auto: 'ยานพาหนะ 🚗', pets: 'สัตว์เลี้ยง 🐾' };
    document.getElementById('search-header').innerHTML = `<h2>หมวดหมู่: <span>${catNames[cat] || cat}</span></h2>`;
    let results = cat === 'flash' ? PRODUCTS.filter(p => p.tags.includes('flash'))
        : cat === 'top' ? PRODUCTS.filter(p => p.tags.includes('top'))
            : cat === 'new' ? PRODUCTS.filter(p => p.tags.includes('new'))
                : PRODUCTS.filter(p => p.category === cat);
    renderSearchResults(results);
}

function doSearch() {
    const q = document.getElementById('search-input').value.trim();
    if (!q) return;
    state.searchQuery = q;
    state.currentCategory = null;
    openPage('search');
    document.getElementById('search-header').innerHTML = `<h2>ผลการค้นหา: <span>"${q}"</span></h2>`;
    const results = PRODUCTS.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || p.category.includes(q.toLowerCase()));
    renderSearchResults(results);
    closeSuggestions();
}

function renderSearchResults(results) {
    renderFilterSidebar();
    renderSortBar();
    const el = document.getElementById('search-results-grid');
    if (!el) return;
    if (results.length === 0) {
        el.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔍</div><h3>ไม่พบสินค้า</h3><p>ลองค้นหาด้วยคำอื่น</p></div>`;
        return;
    }
    const sorted = sortProducts(results, state.sortBy);
    el.innerHTML = sorted.map(p => productCard(p)).join('');
}

function sortProducts(list, by) {
    return [...list].sort((a, b) => {
        if (by === 'popular') return b.sold - a.sold;
        if (by === 'newest') return b.id - a.id;
        if (by === 'price-asc') return a.price - b.price;
        if (by === 'price-desc') return b.price - a.price;
        if (by === 'rating') return b.rating - a.rating;
        return 0;
    });
}

function renderFilterSidebar() {
    const el = document.getElementById('filter-sidebar');
    if (!el) return;
    el.innerHTML = `
    <div class="filter-title">🔧 กรองสินค้า</div>
    <div class="filter-section">
      <h4>หมวดหมู่</h4>
      ${[['electronics', '📱 อิเล็กทรอนิกส์'], ['fashion', '👗 แฟชั่น'], ['beauty', '💄 ความงาม'], ['home', '🏡 บ้าน'], ['sports', '⚽ กีฬา']].map(([k, v]) => `<div class="filter-option" onclick="filterCategory('${k}')">${v}</div>`).join('')}
    </div>
    <div class="filter-section">
      <h4>ช่วงราคา (฿)</h4>
      <div class="price-range">
        <input type="number" placeholder="ต่ำสุด" id="price-min"/>
        <span>-</span>
        <input type="number" placeholder="สูงสุด" id="price-max"/>
      </div>
      <button onclick="applyPriceFilter()" style="margin-top:8px;background:var(--primary);color:#fff;padding:8px 16px;border-radius:6px;font-family:var(--font);width:100%">ค้นหา</button>
    </div>
    <div class="filter-section">
      <h4>คะแนนรีวิว</h4>
      ${[5, 4, 3].map(r => `<div class="filter-option">${'★'.repeat(r)}${'☆'.repeat(5 - r)} ขึ้นไป</div>`).join('')}
    </div>`;
}

function applyPriceFilter() {
    const min = parseFloat(document.getElementById('price-min')?.value) || 0;
    const max = parseFloat(document.getElementById('price-max')?.value) || Infinity;
    let results = state.currentCategory
        ? PRODUCTS.filter(p => p.category === state.currentCategory || p.tags.includes(state.currentCategory))
        : PRODUCTS.filter(p => p.name.toLowerCase().includes(state.searchQuery.toLowerCase()));
    results = results.filter(p => p.price >= min && p.price <= max);
    renderSearchResults(results);
}

function renderSortBar() {
    const el = document.getElementById('sort-bar');
    if (!el) return;
    const sorts = [['popular', 'ยอดนิยม'], ['newest', 'ใหม่ล่าสุด'], ['price-asc', 'ราคาต่ำ-สูง'], ['price-desc', 'ราคาสูง-ต่ำ'], ['rating', 'คะแนน']];
    el.innerHTML = `<span class="sort-label">เรียงตาม:</span>
    ${sorts.map(([k, v]) => `<button class="sort-btn${state.sortBy === k ? ' active' : ''}" onclick="setSort('${k}')">${v}</button>`).join('')}`;
}

function setSort(by) {
    state.sortBy = by;
    if (state.currentCategory) filterCategory(state.currentCategory);
    else doSearch();
}

// ===== SHOP PAGE =====
function viewShop(shopName) {
    state.lastViewedShop = shopName;
    saveToStorage();
    openPage('shop');
    const shopProducts = PRODUCTS.filter(p => p.shop === shopName);

    document.getElementById('shop-header-page').innerHTML = `
    <div class="shop-profile-banner">
        <div class="shop-header-main">
            <div class="shop-avatar-large">🏪</div>
            <div class="shop-header-info">
                <h1>${shopName}</h1>
                <div class="shop-header-stats">
                    <span>⭐ ${((shopProducts.reduce((s, p) => s + p.rating, 0) / shopProducts.length) || 0).toFixed(1)} / 5.0</span>
                    <span>|</span>
                    <span>รายการสินค้า: ${formatNum(shopProducts.length)}</span>
                    <span>|</span>
                    <span>ผู้ติดตาม: ${formatNum(Math.floor(shopProducts.reduce((s, p) => s + p.sold, 0) / 10))}</span>
                </div>
            </div>
            <button class="btn-follow">+ ติดตาม</button>
        </div>
    </div>`;

    // ===== PROMOTIONS SECTION =====
    const promoEl = document.getElementById('shop-promotions-section');
    if (promoEl) {
        // หาสินค้าลดราคาในร้าน
        const saleItems = shopProducts.filter(p => p.originalPrice && p.originalPrice > p.price);

        // ดึงคูปองที่ร้านนี้สร้างจริงๆ จากระบบ
        const shopVouchers = (state.vouchers || []).filter(v => v.shop === shopName);

        // แบนเนอร์สิทธิพิเศษร้าน
        const perks = [
            { icon: '🚚', title: 'ส่งฟรี', desc: 'เมื่อซื้อครบ ฿199' },
            { icon: '🛡️', title: 'คืนได้ 15 วัน', desc: 'รับประกันสินค้า' },
            { icon: '⚡', title: 'จัดส่งไว', desc: '1-3 วันทำการ' },
            { icon: '💯', title: 'ของแท้ 100%', desc: 'สินค้าผ่านการตรวจสอบ' },
        ];

        promoEl.innerHTML = `
        <div class="shop-promo-wrapper">

            <!-- สิทธิพิเศษ -->
            <div class="shop-perks-bar">
                ${perks.map(pk => `
                <div class="shop-perk-item">
                    <span class="shop-perk-icon">${pk.icon}</span>
                    <div>
                        <div class="shop-perk-title">${pk.title}</div>
                        <div class="shop-perk-desc">${pk.desc}</div>
                    </div>
                </div>`).join('')}
            </div>

            <!-- โค้ดส่วนลดร้านค้า -->
            ${shopVouchers.length > 0 ? `
            <div class="shop-voucher-section">
                <div class="shop-voucher-header">
                    <span class="shop-voucher-title">🎫 คูปองส่วนลดร้านนี้</span>
                    <span class="shop-voucher-sub">กดรับได้เลย ใช้งานได้ทันที</span>
                </div>
                <div class="shop-voucher-list">
                    ${shopVouchers.map(v => `
                    <div class="shop-voucher-card">
                        <div class="shop-voucher-left">
                            <div class="shop-voucher-amount">${v.isFreeShip ? '🚚 ส่งฟรี' : `฿${v.discount}`}</div>
                            <div class="shop-voucher-cond">${v.desc}</div>
                        </div>
                        <div class="shop-voucher-right">
                            <div class="shop-voucher-code">${v.code}</div>
                            <button class="shop-voucher-btn" onclick="claimShopVoucher('${v.code}', ${v.discount}, ${v.minOrder}, '${shopName}', ${v.isFreeShip || false})">
                                รับโค้ด
                            </button>
                        </div>
                    </div>`).join('')}
                </div>
            </div>` : ''}

            ${saleItems.length > 0 ? `
            <!-- สินค้าลดราคาในร้าน -->
            <div class="shop-sale-section">
                <div class="shop-sale-header">
                    <span>🔥 สินค้าลดราคาในร้านนี้</span>
                    <span class="shop-sale-badge">Flash Deal</span>
                </div>
                <div class="shop-sale-grid">
                    ${saleItems.slice(0, 4).map(p => {
            const disc = Math.round((1 - p.price / p.originalPrice) * 100);
            return `
                        <div class="shop-sale-item" onclick="viewProduct(${p.id})">
                            <div class="shop-sale-emoji">${p.emoji}</div>
                            <div class="shop-sale-discount-badge">-${disc}%</div>
                            <div class="shop-sale-name">${p.name.substring(0, 20)}</div>
                            <div class="shop-sale-prices">
                                <span class="shop-sale-price">฿${formatNum(p.price)}</span>
                                <span class="shop-sale-orig">฿${formatNum(p.originalPrice)}</span>
                            </div>
                        </div>`;
        }).join('')}
                </div>
            </div>` : ''}

        </div>`;
    }

    const grid = document.getElementById('shop-products-grid');
    if (grid) {
        grid.innerHTML = shopProducts.map(p => productCard(p)).join('');
    }
}

function claimShopVoucher(code, discount, minOrder, shopName, isFreeShip) {
    // เพิ่ม voucher เข้า state.vouchers ถ้ายังไม่มี
    if (!state.vouchers) state.vouchers = [...VOUCHERS];
    const exists = state.vouchers.find(v => v.code === code);
    if (!exists) {
        state.vouchers.push({ code, discount: isFreeShip ? 0 : discount, minOrder, shop: shopName, isFreeShip: isFreeShip || false });
        saveToStorage();
    }
    // Copy code to clipboard
    navigator.clipboard.writeText(code).catch(() => { });
    showToast('success', `🎫 รับโค้ด <b>${code}</b> สำเร็จ! คัดลอกแล้ว ใช้ได้เมื่อซื้อครบ ฿${minOrder}`);
}

// ===== SEARCH SUGGESTIONS =====
function initSearch() {
    const input = document.getElementById('search-input');
    if (!input) return;
    input.addEventListener('input', () => {
        const q = input.value.trim();
        const sugEl = document.getElementById('search-suggestions');
        if (!sugEl) return;
        if (!q) { sugEl.classList.remove('open'); return; }
        const matches = PRODUCTS.filter(p => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6);
        if (!matches.length) { sugEl.classList.remove('open'); return; }
        sugEl.innerHTML = matches.map(p => `<div class="suggest-item" onclick="quickSearch('${p.name}')"><span>${p.emoji}</span><span>${p.name}</span></div>`).join('');
        sugEl.classList.add('open');
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    document.addEventListener('click', e => { if (!e.target.closest('.search-input-wrap')) closeSuggestions(); });
}

function quickSearch(name) {
    document.getElementById('search-input').value = name;
    doSearch();
}

function closeSuggestions() {
    const el = document.getElementById('search-suggestions');
    if (el) el.classList.remove('open');
}

// ===== CHECKOUT =====
function renderCheckout() {
    const formEl = document.getElementById('checkout-form');
    const sumEl = document.getElementById('checkout-summary');
    if (!formEl || !sumEl) return;

    formEl.innerHTML = `
    <div class="checkout-section">
      <h3>📍 ที่อยู่จัดส่ง</h3>
      <div class="form-row">
        <div class="form-group"><label>ชื่อ</label><input id="co-fname" placeholder="ชื่อ" value="${state.user?.name?.split(' ')[0] || ''}" /></div>
        <div class="form-group"><label>นามสกุล</label><input id="co-lname" placeholder="นามสกุล" /></div>
      </div>
      <div class="form-group"><label>เบอร์โทร</label><input id="co-phone" placeholder="08X-XXX-XXXX" value="${state.user?.phone || ''}" /></div>
      <div class="form-group"><label>ที่อยู่</label><textarea id="co-addr" rows="3" placeholder="บ้านเลขที่ ถนน แขวง เขต"></textarea></div>
      <div class="form-row">
        <div class="form-group"><label>จังหวัด</label><select id="co-province"><option>กรุงเทพมหานคร</option><option>เชียงใหม่</option><option>ภูเก็ต</option><option>ขอนแก่น</option><option>นครราชสีมา</option><option>สงขลา</option></select></div>
        <div class="form-group"><label>รหัสไปรษณีย์</label><input id="co-zip" placeholder="10XXX" /></div>
      </div>
    </div>
    <div class="checkout-section">
      <h3>🚚 วิธีจัดส่ง</h3>
      <div class="payment-method">
        <div class="pay-method-btn active" onclick="selectShipping(this,'standard')"><span class="pm-icon">📦</span>มาตรฐาน<br><small>2-3 วัน • ฟรี</small></div>
        <div class="pay-method-btn" onclick="selectShipping(this,'express')"><span class="pm-icon">⚡</span>ด่วน<br><small>1 วัน • ฿50</small></div>
        <div class="pay-method-btn" onclick="selectShipping(this,'same')"><span class="pm-icon">🏍️</span>วันนี้<br><small>3 ชม. • ฿99</small></div>
      </div>
    </div>
    <div class="checkout-section">
      <h3>💳 วิธีชำระเงิน</h3>
      <div class="payment-method">
        <div class="pay-method-btn active" onclick="selectPayment(this,'card')"><span class="pm-icon">💳</span>บัตรเครดิต</div>
        <div class="pay-method-btn" onclick="selectPayment(this,'qr')"><span class="pm-icon">📱</span>QR Code</div>
        <div class="pay-method-btn" onclick="selectPayment(this,'transfer')"><span class="pm-icon">🏦</span>โอนเงิน</div>
        <div class="pay-method-btn" onclick="selectPayment(this,'cod')"><span class="pm-icon">💵</span>เก็บปลายทาง</div>
        <div class="pay-method-btn" onclick="selectPayment(this,'wallet')"><span class="pm-icon">👛</span>ShopNow Pay</div>
        <div class="pay-method-btn" onclick="selectPayment(this,'installment')"><span class="pm-icon">📅</span>ผ่อนชำระ</div>
      </div>
    </div>
    <div class="checkout-section" id="checkout-voucher-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">🎫 คูปองส่วนลดร้านนี้</h3>
        <span style="font-size:12px;color:var(--text-3)">กดรับได้เลย ใช้งานได้ทันที</span>
      </div>
      ${(() => {
            const vlist = state.vouchers || VOUCHERS;
            const subtotal = state.cart.reduce((s, c) => {
                const p = PRODUCTS.find(x => x.id === c.id);
                const price = c.price || (p ? p.price : 0);
                return s + (price * c.qty);
            }, 0);
            if (!vlist.length) return '<p style="font-size:13px;color:var(--text-3)">ไม่มีคูปองในขณะนี้</p>';
            return `<div style="display:flex;flex-wrap:wrap;gap:10px">
          ${vlist.map(v => {
                const applied = state.appliedCoupon?.code === v.code;
                const eligible = subtotal >= v.minOrder;
                return `
            <div style="display:flex;border:2px solid ${applied ? 'var(--primary)' : '#eee'};border-radius:12px;overflow:hidden;min-width:220px;max-width:280px;background:${applied ? '#fff5f5' : '#fff'}">
              <div style="background:${applied ? 'var(--primary)' : '#f5f5f5'};padding:12px 14px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:72px">
                <div style="font-size:${v.isFreeShip ? '13px' : '18px'};font-weight:800;color:${applied ? '#fff' : 'var(--primary)'}">${v.isFreeShip ? '🚚 ส่งฟรี' : `฿${v.discount}`}</div>
                <div style="font-size:10px;color:${applied ? 'rgba(255,255,255,0.8)' : '#999'};margin-top:2px">ส่วนลด</div>
              </div>
              <div style="padding:10px 12px;flex:1;display:flex;flex-direction:column;justify-content:space-between">
                <div>
                  <div style="font-size:12px;font-weight:700;color:#333;letter-spacing:0.5px">${v.code}</div>
                  <div style="font-size:11px;color:#888;margin-top:2px">${v.desc}</div>
                </div>
                <button onclick="applyCouponFromCheckout('${v.code}')" style="margin-top:8px;background:${applied ? '#ccc' : (eligible ? 'var(--primary)' : '#ddd')};color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;cursor:${eligible && !applied ? 'pointer' : 'default'};font-family:var(--font);font-weight:600">
                  ${applied ? '✅ ใช้อยู่' : (eligible ? 'รับโค้ด' : `ซื้อครบ ฿${v.minOrder}`)}
                </button>
              </div>
            </div>`;
            }).join('')}
        </div>
        ${state.appliedCoupon ? `<div style="margin-top:10px;padding:8px 12px;background:#fff5f5;border:1px solid var(--primary);border-radius:8px;font-size:13px;color:var(--primary);display:flex;justify-content:space-between;align-items:center">
          <span>🎉 ใช้โค้ด <b>${state.appliedCoupon.code}</b> ลด ฿${state.appliedCoupon.discount}</span>
          <button onclick="removeCouponFromCheckout()" style="background:none;border:none;color:#999;font-size:16px;cursor:pointer">✕</button>
        </div>` : ''}
        <div style="display:flex;gap:8px;margin-top:10px">
          <input type="text" id="co-coupon-code" placeholder="กรอกโค้ดส่วนลด" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-family:var(--font);font-size:13px"/>
          <button onclick="applyCouponFromCheckout()" style="background:var(--primary);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-family:var(--font);font-size:13px;cursor:pointer;font-weight:600">ใช้โค้ด</button>
        </div>`;
        })()}
    </div>`;

    const subtotal = state.cart.reduce((s, c) => {
        const p = PRODUCTS.find(x => x.id === c.id);
        const price = c.price || (p ? p.price : 0);
        return s + (price * c.qty);
    }, 0);
    const shipping = getShippingCost(subtotal);
    const discount = state.appliedCoupon?.discount || 0;
    const total = subtotal + shipping - discount;

    sumEl.innerHTML = `
        <h3>รายการสั่งซื้อ</h3>
            ${state.cart.map(c => {
        const p = PRODUCTS.find(x => x.id === c.id);
        const price = c.price || (p ? p.price : 0);
        return p ? `<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)"><div style="font-size:28px">${p.emoji}</div><div style="flex:1"><div style="font-size:13px">${p.name.substr(0, 30)}...</div><div style="font-size:12px;color:var(--text-3)">${c.variant} | x${c.qty}</div></div><div style="color:var(--primary);font-weight:600">฿${formatNum(price * c.qty)}</div></div>` : ''
    }).join('')}
    <div class="summary-row"><span>ราคาสินค้า</span><span>฿${formatNum(subtotal)}</span></div>
    <div class="summary-row"><span>ค่าจัดส่ง</span><span>฿${shipping}</span></div>
    ${discount ? `<div class="summary-row" style="color:var(--primary)"><span>ส่วนลด</span><span>-฿${discount}</span></div>` : ''}
    <div class="summary-row total"><span>ยอดชำระ</span><span>฿${formatNum(total)}</span></div>
    <button class="btn-checkout" onclick="placeOrder()">✅ ยืนยันคำสั่งซื้อ</button>
    <p style="text-align:center;font-size:12px;color:var(--text-3);margin-top:8px">🔒 การชำระเงินปลอดภัย 100%</p>`;
}

function selectPayment(el, method) {
    el.closest('.payment-method').querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    state.paymentMethod = method;
}

function selectShipping(el, method) {
    el.closest('.payment-method').querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    state.shippingMethod = method;
    // อัปเดต summary ทันทีเมื่อเปลี่ยนวิธีจัดส่ง
    updateCheckoutSummary();
}

function getShippingCost(subtotal) {
    if (state.shippingMethod === 'express') return 50;
    if (state.shippingMethod === 'same') return 99;
    // มาตรฐาน: ส่งฟรีถ้าซื้อครบ 199
    return subtotal >= 199 ? 0 : 40;
}

function updateCheckoutSummary() {
    const sumEl = document.getElementById('checkout-summary');
    if (!sumEl) return;
    const subtotal = state.cart.reduce((s, c) => {
        const p = PRODUCTS.find(x => x.id === c.id);
        const price = c.price || (p ? p.price : 0);
        return s + (price * c.qty);
    }, 0);
    const shipping = getShippingCost(subtotal);
    const discount = state.appliedCoupon?.discount || 0;
    const total = subtotal + shipping - discount;
    // อัปเดตเฉพาะแถวสรุปโดยไม่ render ใหม่ทั้งหมด
    const rows = sumEl.querySelectorAll('.summary-row');
    rows.forEach(row => {
        if (row.querySelector('span:first-child')?.textContent === 'ค่าจัดส่ง') {
            row.querySelector('span:last-child').textContent = shipping === 0 ? 'ฟรี' : `฿${shipping} `;
        }
        if (row.classList.contains('total')) {
            row.querySelector('span:last-child').textContent = `฿${formatNum(total)} `;
        }
    });
}

async function placeOrder() {
    const fname = document.getElementById('co-fname')?.value;
    const phone = document.getElementById('co-phone')?.value;
    const addr = document.getElementById('co-addr')?.value;
    if (!fname || !phone || !addr) { showToast('error', '❌ กรุณากรอกข้อมูลให้ครบถ้วน'); return; }

    // ✅ 1. ตรวจสต็อกก่อนสั่งซื้อ (Pre-check)
    for (const c of state.cart) {
        const p = PRODUCTS.find(x => x.id === c.id);
        if (!p) { showToast('error', '❌ ไม่พบสินค้าบางรายการ'); return; }
        if (p.stock < c.qty) {
            showToast('error', `❌ สินค้า "${p.name.substring(0, 20)}" สต็อกไม่พอ(เหลือ ${p.stock} ชิ้น)`);
            return;
        }
    }

    const orderId = 'SN' + Date.now().toString().slice(-8);
    const subtotal = state.cart.reduce((s, c) => {
        const p = PRODUCTS.find(x => x.id === c.id);
        const price = c.price || (p ? p.price : 0);
        return s + (price * c.qty);
    }, 0);

    // ✅ 2. ตัดสต็อกแบบ Direct (อัปเดตทั้งใน PRODUCTS และ sellerProducts)
    state.cart.forEach(c => {
        const cid = String(c.id);

        // ค้นหาใน PRODUCTS (ที่มีทุกอย่างรวมอยู่แล้ว)
        const p = PRODUCTS.find(x => String(x.id) === cid);
        if (p) {
            p.stock = Math.max(0, p.stock - c.qty);
            p.sold = (p.sold || 0) + c.qty;
        }

        // ค้นหาใน sellerProducts เพื่อบันทึกลงถัง seller แยกต่างหาก (แต่ต้องเช็คว่าไม่ใช่ Object เดียวกันกับ p เพื่อกันการตัดซ้ำซ้อน)
        const sp = sellerProducts.find(x => String(x.id) === cid);
        if (sp && sp !== p) {
            sp.stock = Math.max(0, sp.stock - c.qty);
            sp.sold = (sp.sold || 0) + c.qty;
        }
    });

    // ✅ 3. บันทึกข้อมูลลง LocalStorage ทันที
    saveStockToStorage();
    localStorage.setItem('shopnow_seller_products', JSON.stringify(sellerProducts));

    const shipping = getShippingCost(subtotal);
    const discount = state.appliedCoupon?.discount || 0;
    const finalTotal = subtotal + shipping - discount;

    const order = {
        id: orderId,
        items: [...state.cart],
        total: finalTotal,
        discount: discount,
        shipping: shipping,
        date: new Date().toLocaleDateString('th-TH'),
        status: 'shipping',
        address: `${fname} | ${phone} | ${addr} `,
        paymentMethod: state.paymentMethod || 'card',
        shippingMethod: state.shippingMethod || 'standard',
        userId: state.user?.id || null // ระบุเจ้าของออเดอร์
    };
    state.orders.unshift(order);
    state.cart = [];
    state.appliedCoupon = null;

    // ✅ 4. อัปเดต UI ทั่วไป
    updateCartBadge();
    saveToStorage();

    // ☁️ บันทึกลง Cloud
    await saveOnlineOrder(order);

    // ✅ 5. รีเฟรชหน้าร้านค้าและ Dashboard (ถ้าเปิดอยู่)
    renderFlashProducts();
    renderFeaturedProducts();
    renderNewProducts();
    renderAllProducts();

    // ถ้าฝั่งคนขายเปิดหน้า Dashboard ค้างไว้ ให้สั่ง Render ใหม่
    const sdContent = document.getElementById('seller-content');
    if (sdContent && document.activeElement && document.getElementById('page-seller-dash').classList.contains('active')) {
        const activeNav = document.querySelector('.seller-nav-item.active');
        if (activeNav) {
            const tab = activeNav.id.replace('snav-', '');
            sdTab(tab);
        }
    }

    document.getElementById('success-order-id').textContent = `หมายเลขคำสั่งซื้อ: ${orderId} `;
    openPage('success');
    showToast('success', '🎉 ชำระเงินและตัดสต็อกเรียบร้อยแล้ว!');
}

// ===== COUPON HELPERS FOR CHECKOUT =====
function applyCouponFromCheckout(forcedCode) {
    const code = forcedCode || document.getElementById('co-coupon-code')?.value.trim().toUpperCase();
    if (!code) { showToast('error', '❌ กรุณากรอกโค้ดส่วนลด'); return; }

    const list = state.vouchers || VOUCHERS;
    const v = list.find(x => x.code === code);
    if (!v) { showToast('error', '❌ ไม่พบโค้ดส่วนลดนี้'); return; }

    const subtotal = state.cart.reduce((s, c) => {
        const p = PRODUCTS.find(x => x.id === c.id);
        return s + (p ? p.price * c.qty : 0);
    }, 0);

    if (subtotal < v.minOrder) {
        showToast('error', `❌ ยอดซื้อขั้นต่ำไม่ถึง ฿${v.minOrder} (มียอด ฿${subtotal})`);
        return;
    }

    state.appliedCoupon = v;
    showToast('success', `🎉 ใช้โค้ด ${v.code} ลด ฿${v.discount} สำเร็จ!`);
    renderCheckout();
    updateCheckoutSummary();
}

function removeCouponFromCheckout() {
    state.appliedCoupon = null;
    showToast('', '🗑️ ยกเลิกโค้ดส่วนลดแล้ว');
    renderCheckout();
    updateCheckoutSummary();
}

// ===== ORDERS =====
function renderOrders() {
    // โหลด orders ล่าสุดจาก localStorage ทุกครั้ง เพื่อให้ tracking number ที่ seller บันทึกแสดงในหน้าลูกค้าเสมอ
    const freshState = JSON.parse(localStorage.getItem('shopnow_state') || '{}');
    if (freshState.orders) state.orders = freshState.orders;
    const el = document.getElementById('orders-list');
    if (!el) return;

    // 🔒 กรองเฉพาะออเดอร์ที่เกี่ยวข้องกับเบอร์โทรหรือไอดีเรา
    let orders = state.orders.filter(o => {
        if (!state.user) return false;

        // ฟังก์ชันดึงเลข 10 หลักสุดท้าย
        const getTenDigits = (str) => {
            const digits = String(str || '').replace(/[^0-9]/g, '');
            return digits.length >= 10 ? digits.slice(-10) : digits;
        };

        const myDigits = getTenDigits(state.user.phone || state.user.id);
        if (!myDigits) return false;

        const orderUserIdDigits = getTenDigits(o.userId);
        const orderAddrDigits = getTenDigits(o.address);

        // ถ้าเลข 10 หลักตรงกับไอดีคนซื้อ หรือ ตรงกับเบอร์ในที่อยู่ ให้ถือว่าเป็นเจ้าของ
        return (orderUserIdDigits === myDigits) || (orderAddrDigits.includes(myDigits));
    });

    if (state.orderFilter !== 'all') {
        orders = orders.filter(o => o.status === state.orderFilter);
    }
    if (!orders.length) {
        el.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><h3>ยังไม่มีคำสั่งซื้อ</h3><p>เริ่มช้อปปิ้งก็เริ่มต้นคำสั่งซื้อของคุณได้เลย</p><button class="btn-primary" style="display:inline-block;padding:12px 32px;border-radius:8px" onclick="openPage('home')">ช้อปเลย</button></div>`;
        return;
    }
    el.innerHTML = orders.map(o => {
        const statusMap = { pending: 'รอชำระเงิน', shipping: 'กำลังจัดส่ง', delivered: 'ส่งสำเร็จ' };
        const statusClass = { pending: 'status-pending', shipping: 'status-shipping', delivered: 'status-delivered' };
        return `<div class="order-card">
        <div class="order-card-header">
            <div><strong>หมายเลขคำสั่งซื้อ:</strong> ${o.id}</div>
            <div style="display:flex;align-items:center;gap:12px">
                <span style="color:var(--text-3);font-size:13px">${o.date}</span>
                <span class="order-status ${statusClass[o.status] || 'status-shipping'}">${statusMap[o.status] || 'กำลังดำเนินการ'}</span>
            </div>
        </div>
      ${o.trackingNum ? `
      <div style="background:linear-gradient(135deg,#e3f2fd,#bbdefb);border-left:4px solid #1976d2;padding:10px 14px;margin:0;display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">🚚</span>
          <div>
            <div style="font-size:11px;color:#555;margin-bottom:1px">หมายเลขติดตามพัสดุ</div>
            <div style="font-size:14px;font-weight:700;color:#1565c0;font-family:monospace;letter-spacing:1px">${o.trackingNum}</div>
          </div>
        </div>
        <button onclick="navigator.clipboard.writeText('${o.trackingNum}').then(()=>showToast('success','✅ คัดลอกเลข Tracking แล้ว!'))" 
          style="background:#1976d2;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer">
          📋 คัดลอก
        </button>
      </div>` : (o.status === 'shipping' ? `
      <div style="background:#fff8e1;border-left:4px solid #ffa000;padding:10px 14px;display:flex;align-items:center;gap:8px">
        <span>⏳</span><span style="font-size:12px;color:#e65100">กำลังเตรียมจัดส่ง ร้านค้าจะอัปเดตเลข Tracking เร็วๆ นี้</span>
      </div>` : '')
            }
      <div class="order-items">
        ${o.items.slice(0, 3).map(c => {
                const p = PRODUCTS.find(x => x.id === c.id);
                if (!p) return '';
                const pImg = (p.images && p.images[0]) ? `<img src="${p.images[0]}" style="width:100%;height:100%;object-fit:cover">` :
                    (p.image ? `<img src="${p.image}" style="width:100%;height:100%;object-fit:cover">` : `<span style="font-size:20px">${p.emoji || '📦'}</span>`);
                return `
            <div class="order-item">
                <div class="order-item-img" style="overflow:hidden; display:flex; align-items:center; justify-content:center; background:#f5f5f5">
                    ${pImg}
                </div>
                <div style="flex:1">
                    <div style="font-size:13px;font-weight:500">${p.name}</div>
                    <div style="font-size:12px;color:var(--text-3)">จำนวน ${c.qty} ชิ้น ${c.variant ? `(${c.variant})` : ''}</div>
                </div>
                <div style="color:var(--primary);font-weight:600">฿${formatNum((c.price || p.price) * c.qty)}</div>
            </div>`;
            }).join('')}
        ${o.items.length > 3 ? `<div style="font-size:13px;color:var(--text-3);padding-left:12px">+ อีก ${o.items.length - 3} รายการ</div>` : ''}
      </div>
      <div class="order-card-footer">
        <div style="font-size:12px;color:var(--text-3)">
            ทั้งหมด ${o.items.reduce((s, c) => s + c.qty, 0)} ชิ้น
            ${o.shipping > 0 ? ` | ค่าส่ง ฿${o.shipping}` : ' | ส่งฟรี'}
            ${o.discount > 0 ? ` | <span style="color:var(--primary)">ส่วนลด -฿${o.discount}</span>` : ''}
        </div>
        <div class="order-total">ยอดรวม ฿${formatNum(o.total)}</div>
      </div>
    </div>`;
    }).join('');
}

function filterOrders(status) {
    state.orderFilter = status;
    document.querySelectorAll('.order-tab-btn').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');
    renderOrders();
}

// ===== PROFILE =====
function renderProfile() {
    if (!state.user) { openModal('login-modal'); return; }
    const sideEl = document.getElementById('profile-sidebar');
    const contEl = document.getElementById('profile-content');
    if (!sideEl || !contEl) return;
    sideEl.innerHTML = `
        <div class="profile-avatar-box">
      <div class="profile-avatar">👤</div>
      <div class="profile-username">${state.user.name}</div>
      <div style="font-size:12px;color:var(--text-3)">${state.user.phone || state.user.email || ''}</div>
    </div>
    <div class="profile-nav-item active">👤 โปรไฟล์ของฉัน</div>
    <div class="profile-nav-item" onclick="openPage('orders')">📦 คำสั่งซื้อ</div>
    <div class="profile-nav-item" onclick="openPage('wishlist')">❤️ รายการโปรด</div>
    <div class="profile-nav-item" onclick="openModal('voucher-modal')">🎁 คูปองของฉัน</div>
    <div class="profile-nav-item" onclick="logout()">🚪 ออกจากระบบ</div>`;
    contEl.innerHTML = `
        <h3 style="margin-bottom:20px">โปรไฟล์ของฉัน</h3>
    <div class="form-group"><label>ชื่อ-นามสกุล</label><input value="${state.user.name}" id="profile-name"/></div>
    <div class="form-group"><label>เบอร์โทร</label><input value="${state.user.phone || ''}" id="profile-phone"/></div>
    <div class="form-group"><label>อีเมล</label><input value="${state.user.email || ''}" id="profile-email"/></div>
    <div class="form-group"><label>วันเกิด</label><input type="date" id="profile-dob"/></div>
    <div class="form-group"><label>เพศ</label><select id="profile-gender"><option>ชาย</option><option>หญิง</option><option>ไม่ระบุ</option></select></div>
    
    ${!state.user.isSeller ? `
    <div style="background:#fff3e0; padding:20px; border-radius:12px; border-left:4px solid #ff9800; margin-top:20px">
        <h4 style="margin-bottom:8px">💰 เริ่มต้นสร้างรายได้กับเรา!</h4>
        <p style="font-size:13px; color:#666; margin-bottom:12px">คุณยังไม่เปิดร้านค้า คลิกปุ่มเพื่อเริ่มต้นลงสินค้าขายบน ShopNow</p>
        <button class="btn-primary" style="background:#ff9800; border-color:#ff9800; padding:10px 20px" onclick="upgradeToSeller()">เปิดร้านค้าเลย</button>
    </div>` : ''
        }

    <button class="btn-primary" style="padding:12px 32px;border-radius:8px;margin-top:20px" onclick="saveProfile()">บันทึกข้อมูลส่วนตัว</button>`;
}

function upgradeToSeller() {
    state.user.isSeller = true;
    syncUserToGlobalList(); // ✅ บันทึกเข้าถังแอดมินทันที
    saveToStorage();
    renderProfile();
    showToast('success', '🎉 ยินดีด้วย! คุณเปิดร้านค้าเรียบร้อยแล้ว');
}

async function saveProfile() {
    const newName = document.getElementById('profile-name')?.value || state.user.name;
    const newPhone = document.getElementById('profile-phone')?.value || state.user.phone;
    const newEmail = document.getElementById('profile-email')?.value || state.user.email;

    state.user.name = newName;
    state.user.phone = newPhone;
    state.user.email = newEmail;

    // ☁️ อัปเดตขึ้น Cloud ถ้าเป็นสมาชิกออนไลน์
    if (state.user.email && state.user.id.length > 20) { // Check if it's a UUID from Supabase
        await updateUserOnline(newName, { phone: newPhone });
    }

    syncUserToGlobalList(); // ✅ อัปเดตข้อมูลลูกค้าในหน้าแอดมินด้วย
    saveToStorage();
    updateUserUI();
    showToast('success', '✅ บันทึกข้อมูลสำเร็จ');
}

// ✅ ฟังก์ชันช่วย Sync ข้อมูล User ปัจจุบันเข้าลิสต์แอดมิน (ทำให้ Admin เห็นทันที)
async function syncUserToGlobalList() {
    if (!state.user) return;
    if (!state.user.id) state.user.id = Date.now(); // ประกันความปลอดภัยเรื่อง ID

    loadUsers(); // โหลดข้อมูลล่าสุดจาก localStorage มาก่อนกันทับกัน
    const idx = USERS.findIndex(u => u.id === state.user.id || (state.user.phone && u.phone === state.user.phone));

    if (idx >= 0) {
        USERS[idx] = { ...state.user }; // อัปเดตข้อมูลล่าสุด
    } else {
        USERS.push(state.user); // เพิ่มใหม่ถ้ายังไม่มี
    }

    // ☁️ Sync ขึ้น Cloud
    await saveOnlineUser(state.user);

    // ตั้งแต่นี้เราจะไม่ใช้ saveUsers() เพื่อเก็บลง localStorage แล้ว 
    // เพื่อป้องกันความสับสนกับข้อมูลออนไลน์
}

// ===== AUTH =====
async function doLogin() {
    const isEmailTab = document.getElementById('auth-email') && !document.getElementById('auth-email').classList.contains('hidden');

    if (isEmailTab) {
        const email = document.getElementById('login-email')?.value.trim();
        const pass = document.getElementById('login-pass-email')?.value;
        if (!email || !pass) { showToast('error', '❌ กรุณากรอกอีเมลและรหัสผ่าน'); return; }

        showToast('info', '⌛ กำลังเข้าสู่ระบบ...');
        const { data, error } = await signInOnline(email, pass);

        if (error) {
            showToast('error', '❌ ' + error.message);
        } else {
            const user = data.user;
            state.user = {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.full_name || user.email.split('@')[0],
                role: user.user_metadata?.role || 'user',
                isAdmin: user.email === 'houseofstamp@gmail.com' || user.email.includes('admin')
            };

            // ☁️ Sync ลงฐานข้อมูลออนไลน์ด้วย (เผื่อยังไม่มีในตาราง users)
            await syncUserToGlobalList();

            loginSuccess();
        }
        return;
    }

    // เดิม (เบอร์โทร - Legacy/LocalStorage)
    const phone = document.getElementById('login-phone')?.value.trim();
    const pass = document.getElementById('login-pass')?.value;
    if (!phone || !pass) { showToast('error', '❌ กรุณากรอกเบอร์โทรและรหัสผ่าน'); return; }

    // ตรวจสอบเบื้องต้น ถ้าดูเหมือนอีเมลแต่กรอกในช่องเบอร์โทร
    if (phone.includes('@')) {
        showToast('warning', '💡 ดูเหมือนคุณกรอกอีเมลในช่องเบอร์โทร โปรดสลับไปใช้แท็บ "อีเมล"');
        switchAuthTab('email');
        return;
    }

    const userFound = USERS.find(u => u.phone === phone && u.pass === pass);
    if (userFound) {
        if (userFound.isBanned) {
            showToast('error', '🚫 บัญชีของคุณถูกระงับการใช้งาน');
            return;
        }
        state.user = userFound;
        loginSuccess();
    } else {
        // ☁️ ลองหาใน Cloud (Fallback สำหรับกรณีเปลี่ยนเครื่อง)
        showToast('info', '⌛ กำลังตรวจสอบบัญชีออนไลน์...');
        const { data, error } = await signInWithPhoneOnline(phone, pass);
        if (data?.user) {
            state.user = data.user;
            loginSuccess();
        } else {
            const errorMsg = error?.message || 'ไม่พบบัญชีนี้ หรือรหัสผ่านไม่ถูกต้อง';
            showToast('error', `❌ ${errorMsg}`);
            console.error('Cloud Login Error:', error);
        }
    }
}

function loginSuccess() {
    saveToStorage();
    updateUserUI();
    closeModal('login-modal');
    showToast('success', '🎉 ยินดีต้อนรับกลับมาครับ!');
}

function switchAuthTab(type) {
    const tabs = document.querySelectorAll('.auth-tab');
    const phone = document.getElementById('auth-phone');
    const email = document.getElementById('auth-email');
    tabs.forEach(t => t.classList.remove('active'));
    if (type === 'phone') {
        tabs[0].classList.add('active');
        phone?.classList.remove('hidden');
        email?.classList.add('hidden');
    } else {
        tabs[1].classList.add('active');
        phone?.classList.add('hidden');
        email?.classList.remove('hidden');
    }
}

async function doRegister() {
    const name = document.getElementById('reg-name')?.value.trim();
    const phone = document.getElementById('reg-phone')?.value.trim();
    const email = document.getElementById('reg-email')?.value.trim();
    const pass = document.getElementById('reg-pass')?.value;
    const agree = document.getElementById('reg-agree')?.checked;
    const isSeller = document.getElementById('reg-is-seller')?.checked;

    if (!name || !pass || (!phone && !email)) {
        showToast('error', '❌ กรุณากรอกชื่อ รหัสผ่าน และ (เบอร์โทร หรือ อีเมล)');
        return;
    }
    if (pass.length < 6) { showToast('error', '❌ รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
    if (!agree) { showToast('error', '❌ กรุณายอมรับเงื่อนไขการใช้บริการ'); return; }

    // ☁️ จัดเตรียมข้อมูลสมาชิกสำหรับ Cloud
    // ปรับ ID ให้คงที่ตามเบอร์โทรเพื่อป้องกัน duplicate
    let newUser = {
        id: email ? null : 'p-' + phone,
        email: email || '',
        phone: phone || '',
        name: name,
        pass: pass, // เก็บรหัสไว้สำหรับ Sync
        role: 'user',
        isSeller: isSeller || false,
        shopName: isSeller ? (name + "'s Shop") : '',
        isAdmin: (email && (email === 'houseofstamp@gmail.com' || email.includes('admin')))
    };

    if (email) {
        showToast('info', '⌛ กำลังสร้างบัญชีออนไลน์...');
        const { data, error } = await signUpOnline(email, pass, name);
        if (error) {
            showToast('error', '❌ ' + error.message);
            return;
        }
        newUser.id = data.user.id;
    }

    state.user = newUser;

    // ☁️ บังคับส่งข้อมูลลง Cloud (Users Table) ทุกกรณี
    try {
        console.log('🚀 Final Sync Start:', state.user);
        await saveOnlineUser(state.user);

        // 🧪 ตรวจสอบซ้ำ
        const users = await fetchOnlineUsers();
        if (users.some(u => u.name === name)) {
            showToast('success', '🎉 สมัครสมาชิกและบันทึกลง Cloud สำเร็จ!');
        } else {
            console.warn('⚠️ Cloud Sync Delayed');
            showToast('warning', '⏳ กำลังบันทึกข้อมูล (อาจต้องรอสักครู่)');
        }
    } catch (err) {
        console.error('❌ Cloud Failure:', err);
    }

    saveToStorage();
    updateUserUI();
    closeModal('register-modal');
    return;
}



function socialLogin(provider) {
    state.user = { name: 'ShopNow User', phone: '0800000000', email: `user @${provider}.com` };
    saveToStorage();
    updateUserUI();
    closeModal('login-modal');
    showToast('success', `🎉 เข้าสู่ระบบด้วย ${provider} สำเร็จ!`);
}

function logout() {
    state.user = null;
    state.orders = []; // 🔒 ล้างออเดอร์ออกเพื่อความปลอดภัย
    saveToStorage();
    updateUserUI();
    openPage('home');
    showToast('', '👋 ออกจากระบบแล้ว');
}

function updateUserUI() {
    const nameEl = document.getElementById('user-name-top');
    const loginLink = document.getElementById('login-link');
    if (state.user) {
        if (nameEl) nameEl.textContent = state.user.name;
        if (loginLink) loginLink.style.display = 'none';
    } else {
        if (nameEl) nameEl.textContent = 'เข้าสู่ระบบ';
        if (loginLink) loginLink.style.display = 'inline';
    }
}

function toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    if (!menu || !state.user) return;

    let adminLink = '';
    if (state.user.isAdmin) {
        adminLink = `<a href="#" onclick="openPage('admin-dash')" style="color:#d32f2f;font-weight:700">🛠️ จัดการระบบ (Admin)</a>`;
    }

    let sellerLink = '';
    if (state.user.isSeller || state.user.shopName) {
        sellerLink = `<a href="#" onclick="goSellerDash()" style="color:var(--primary);font-weight:700">🏪 จัดการร้านค้า</a>`;
    }

    menu.innerHTML = `
        <a href="#" onclick="openPage('profile')">👤 บัญชีของฉัน</a>
        <a href="#" onclick="openPage('orders')">📦 คำสั่งซื้อของฉัน</a>
        <a href="#" onclick="openPage('wishlist')">❤️ รายการโปรด</a>
        ${sellerLink}
        ${adminLink}
        <a href="#" onclick="logout()">🚪 ออกจากระบบ</a>
    `;
    menu.classList.toggle('open');
}
document.addEventListener('click', e => {
    if (!e.target.closest('#user-dropdown')) document.getElementById('user-menu')?.classList.remove('open');
});

function doForgot() {
    const val = document.getElementById('forgot-input')?.value;
    if (!val) { showToast('error', '❌ กรุณากรอกอีเมลหรือเบอร์โทร'); return; }
    closeModal('forgot-modal');
    showToast('success', '📧 ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว กรุณาตรวจสอบอีเมล/SMS');
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    event.currentTarget.classList.add('active');
    document.getElementById('auth-phone')?.classList.toggle('hidden', tab !== 'phone');
    document.getElementById('auth-email')?.classList.toggle('hidden', tab !== 'email');
}

// ===== VOUCHERS =====
function renderVouchers() {
    const el = document.getElementById('voucher-list');
    if (!el) return;
    // แสดงเฉพาะคูปองส่วนกลาง (ที่ไม่มีเจ้าของร้าน) ในหน้าตลาด
    const list = (state.vouchers || VOUCHERS).filter(v => !v.shop);

    if (list.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:40px;color:#999"><h3>🎫 ยังไม่มีคูปองส่วนกลาง</h3><p>ติดตามโปรโมชั่นใหม่ๆ ได้เร็วๆ นี้</p></div>';
        return;
    }

    el.innerHTML = list.map(v => `
        <div class="voucher-card">
      <div style="flex:1">
        <div class="voucher-code">${v.code}</div>
        <div class="voucher-desc">${v.desc}</div>
        <div style="font-size:10px; color:#999; margin-top:4px">ยอดซื้อขั้นต่ำ ฿${v.minOrder}</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:5px">
          <button class="btn-copy" onclick="copyVoucher('${v.code}')">คัดลอก</button>
          ${state.currentPage === 'cart' ? `<button class="btn-copy" style="background:var(--primary); color:#fff; border:none" onclick="applyCoupon('${v.code}')">ใช้ทันที</button>` : ''}
      </div>
    </div>`).join('');
}

function copyVoucher(code) {
    navigator.clipboard?.writeText(code).catch(() => { });
    showToast('success', `📋 คัดลอกโค้ด ${code} แล้ว!`);
}

// ===== MODALS =====
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
}
function closeModalOutside(e, id) {
    if (e.target === e.currentTarget) closeModal(id);
}

// ===== UTILS =====
function formatNum(n) {
    return n.toLocaleString('th-TH');
}

function getCatName(cat) {
    const map = { electronics: 'อิเล็กทรอนิกส์', fashion: 'แฟชั่น', beauty: 'ความงาม', home: 'บ้านและสวน', sports: 'กีฬา', food: 'อาหาร', toys: 'ของเล่น', books: 'หนังสือ', auto: 'ยานพาหนะ', pets: 'สัตว์เลี้ยง' };
    return map[cat] || cat;
}

function togglePassword(id) {
    const el = document.getElementById(id);
    if (el) el.type = el.type === 'password' ? 'text' : 'password';
}

function showToast(type, msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type} `;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.style.opacity = '0', 2800);
    setTimeout(() => toast.remove(), 3200);
}

// ลบการประกาศตัวแปรซ้ำซ้อนออก (ย้ายไปด้านบนแล้ว)
// let sellerProducts = []; 
// let editingProductId = null;
// let selectedEmoji = '📦';

function goSellerDash() {
    if (!state.user) { openModal('login-modal'); showToast('warning', '⚠️ กรุณาเข้าสู่ระบบก่อนเข้าจัดการร้านค้า'); return; }
    // มั่นใจว่าข้อมูลถูกโหลดแล้ว
    if (sellerProducts.length === 0) initSellerProducts();

    // Set shop name
    const el = document.getElementById('sd-shop-name');
    if (el) el.textContent = (state.user.shopName || state.user.name + " Shop");
    openPage('seller-dash');
}

async function saveSellerProducts() {
    // 1. บันทึกลงถังคนขาย (Local เป็น Backup)
    localStorage.setItem('shopnow_seller_products', JSON.stringify(sellerProducts));

    // ☁️ บันทึกลง Cloud
    if (await isOnline()) {
        for (const sp of sellerProducts) {
            await saveOnlineProduct(sp);
        }
    }

    // 2. อัปเดตเข้า PRODUCTS และถังรวม (Stock Map) ทันที
    const stockMap = JSON.parse(localStorage.getItem('shopnow_stock') || '{}');

    sellerProducts.forEach(sp => {
        const sid = String(sp.id);
        const idx = PRODUCTS.findIndex(p => String(p.id) === sid);

        // อัปเดตในอาเรย์หลักที่กำลังแสดงผล (ใช้ Object.assign เพื่อรักษา Reference เดิม)
        if (idx >= 0) {
            Object.assign(PRODUCTS[idx], sp);
        } else {
            PRODUCTS.push(sp);
        }

        // บังคับอัปเดตสต็อกในถังรวมด้วย
        stockMap[sid] = { stock: sp.stock, sold: sp.sold };
    });

    // 3. บันทึกสต็อกถังรวมลง LocalStorage
    localStorage.setItem('shopnow_stock', JSON.stringify(stockMap));

    // 4. สั่งรีเฟรชหน้าจอที่เปิดอยู่
    refreshCurrentView();
}

function sdTab(tab) {
    state.sellerTab = tab;
    saveToStorage();

    document.querySelectorAll('.seller-nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.getElementById('snav-' + tab);
    if (navEl) navEl.classList.add('active');
    const content = document.getElementById('seller-content');
    if (!content) return;
    if (tab === 'overview') renderSdOverview(content);
    if (tab === 'products') renderSdProducts(content);
    if (tab === 'add') renderSdAddForm(content, null);
    if (tab === 'orders') renderSdOrders(content);
    if (tab === 'vouchers') renderSdVouchers(content);
    if (tab === 'shipping') renderSdShipping(content);
    if (tab === 'settings') renderSdSettings(content);
}

// ===== ADMIN DASHBOARD =====
function admTab(tab) {
    state.adminTab = tab;
    saveToStorage();
    document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.getElementById('anav-' + tab);
    if (navEl) navEl.classList.add('active');
    const content = document.getElementById('admin-content');
    if (!content) return;
    if (tab === 'banners') renderSdBanners(content); // ใช้ตัวเดิมที่เขียนไว้
    if (tab === 'users') {
        content.innerHTML = `<div class="sd-header"><h2>👥 จัดการผู้ใช้งาน</h2></div> <p style="padding:20px">ฟีเจอร์นี้จะมาในอนาคต: แสดงรายชื่อผู้สมัครสมาชิกและสถานะ</p>`;
    }
}

function renderSdBanners(el) {
    el.innerHTML = `
        <div class="sd-header">
        <h2>🖼️ จัดการแบนเนอร์ (ระบบ Admin)</h2>
        <button class="btn-sd btn-sd-primary" onclick="addBannerForm()">+ เพิ่มแบนเนอร์</button>
    </div>
    <div style="font-size:13px;color:var(--text-3);margin-bottom:16px">จัดการ Slider หน้าแรกของแพลตฟอร์ม</div>
    
    <div class="sd-table-wrap">
        <table class="sd-table">
            <thead>
                <tr>
                    <th>หน้าตา</th>
                    <th>หัวข้อ / รายละเอียด</th>
                    <th>ปุ่ม / ลิงก์</th>
                    <th>จัดการ</th>
                </tr>
            </thead>
            <tbody>
                ${state.banners.map(b => `
                <tr>
                    <td><div style="font-size:32px">${b.visual}</div></td>
                    <td>
                        <div style="font-weight:600">${b.title}</div>
                        <div style="font-size:12px;color:var(--text-3)">${b.desc}</div>
                    </td>
                    <td>
                        <div class="badge badge-new">${b.btnText}</div>
                        <div style="font-size:11px;margin-top:4px">ไปที่: ${b.cat}</div>
                    </td>
                    <td>
                        <div style="display:flex;gap:6px">
                            <button class="btn-sd btn-sd-outline" onclick="editBannerForm(${b.id})">✏️</button>
                            <button class="btn-sd btn-sd-danger" onclick="deleteBanner(${b.id})">🗑️</button>
                        </div>
                    </td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </div>`;
}

function addBannerForm() {
    const content = document.getElementById('admin-content');
    content.innerHTML = `
        <div class="sd-header">
        <h2>➕ เพิ่มแบนเนอร์ใหม่</h2>
        <button class="btn-sd btn-sd-outline" onclick="admTab('banners')">← กลับ</button>
    </div>
        <div class="sd-form">
            <div class="form-group"><label>หัวข้อเล็ก (Badge)</label><input id="bn-badge" placeholder="เช่น 🔥 Hot Deal" /></div>
            <div class="form-group"><label>หัวข้อหลัก (Title) *</label><input id="bn-title" placeholder="เช่น ลดล้างสต็อก!" /></div>
            <div class="form-group"><label>รายละเอียด (Description)</label><input id="bn-desc" placeholder="เช่น สินค้าถูกที่สุดในสามโลก" /></div>
            <div class="form-row">
                <div class="form-group"><label>ข้อความบนปุ่ม</label><input id="bn-btnText" value="ช้อปเลย →" /></div>
                <div class="form-group"><label>ลิงก์หมวดหมู่</label>
                    <select id="bn-cat">
                        <option value="flash">Flash Sale</option>
                        <option value="electronics">อิเล็กทรอนิกส์</option>
                        <option value="fashion">แฟชั่น</option>
                        <option value="beauty">ความงาม</option>
                        <option value="home">บ้าน</option>
                    </select>
                </div>
            </div>
            <div class="form-group"><label>ไอคอน / Emoji (Visual)</label><input id="bn-visual" value="🎁" /></div>
            <button class="btn-sd btn-sd-primary" onclick="saveNewBanner()">✅ บันทึกแบนเนอร์</button>
        </div>`;
}

function editBannerForm(id) {
    const b = state.banners.find(x => x.id === id);
    if (!b) return;
    const content = document.getElementById('admin-content');
    content.innerHTML = `
            < div class="sd-header" >
        <h2>✏️ แก้ไขแบนเนอร์</h2>
        <button class="btn-sd btn-sd-outline" onclick="admTab('banners')">← กลับ</button>
    </div >
        <div class="sd-form">
            <div class="form-group"><label>หัวข้อเล็ก (Badge)</label><input id="bn-badge" value="${b.badge}" /></div>
            <div class="form-group"><label>หัวข้อหลัก (Title) *</label><input id="bn-title" value="${b.title}" /></div>
            <div class="form-group"><label>รายละเอียด (Description)</label><input id="bn-desc" value="${b.desc}" /></div>
            <div class="form-row">
                <div class="form-group"><label>ข้อความบนปุ่ม</label><input id="bn-btnText" value="${b.btnText}" /></div>
                <div class="form-group"><label>ลิงก์หมวดหมู่</label>
                    <select id="bn-cat">
                        <option value="flash" ${b.cat === 'flash' ? 'selected' : ''}>Flash Sale</option>
                        <option value="electronics" ${b.cat === 'electronics' ? 'selected' : ''}>อิเล็กทรอนิกส์</option>
                        <option value="fashion" ${b.cat === 'fashion' ? 'selected' : ''}>แฟชั่น</option>
                        <option value="beauty" ${b.cat === 'beauty' ? 'selected' : ''}>ความงาม</option>
                        <option value="home" ${b.cat === 'home' ? 'selected' : ''}>บ้าน</option>
                    </select>
                </div>
            </div>
            <div class="form-group"><label>ไอคอน / Emoji (Visual)</label><input id="bn-visual" value="${b.visual}" /></div>
            <button class="btn-sd btn-sd-primary" onclick="updateBanner(${b.id})">💾 บันทึกการแก้ไข</button>
        </div>`;
}

async function saveNewBanner() {
    const newB = {
        id: Date.now(),
        badge: document.getElementById('bn-badge').value,
        title: document.getElementById('bn-title').value,
        desc: document.getElementById('bn-desc').value,
        btnText: document.getElementById('bn-btnText').value,
        cat: document.getElementById('bn-cat').value,
        visual: document.getElementById('bn-visual').value
    };
    if (!newB.title) { showToast('error', '❌ กรุณาใส่หัวข้อหลัก'); return; }

    // ☁️ บันทึกลง Cloud
    await saveOnlineBanner(newB);

    state.banners.push(newB);
    saveToStorage();
    showToast('success', '🎉 เพิ่มแบนเนอร์สำเร็จ!');
    admTab('banners');
}

async function updateBanner(id) {
    const b = state.banners.find(x => x.id === id);
    if (b) {
        b.badge = document.getElementById('bn-badge').value;
        b.title = document.getElementById('bn-title').value;
        b.desc = document.getElementById('bn-desc').value;
        b.btnText = document.getElementById('bn-btnText').value;
        b.cat = document.getElementById('bn-cat').value;
        b.visual = document.getElementById('bn-visual').value;

        // ☁️ บันทึกลง Cloud
        await saveOnlineBanner(b);

        saveToStorage();
        showToast('success', '✅ แก้ไขแบนเนอร์สำเร็จ!');
        admTab('banners');
    }
}

async function deleteBanner(id) {
    if (state.banners.length <= 1) { showToast('warning', '⚠️ ต้องมีอย่างน้อย 1 แบนเนอร์'); return; }
    if (!confirm('ต้องการลบแบนเนอร์นี้?')) return;

    // ☁️ ลบใน Cloud
    await deleteOnlineBanner(id);

    state.banners = state.banners.filter(x => x.id !== id);
    saveToStorage();
    showToast('warning', '🗑️ ลบแบนเนอร์แล้ว');
    admTab('banners');
}

function renderSdOverview(el) {
    const sellerProductIds = sellerProducts.map(p => String(p.id));
    const myShopName = state.user?.shopName || (state.user?.name + " Shop");

    // helper: ออเดอร์นี้มีสินค้าของร้านเราไหม?
    function orderBelongsToSeller(order) {
        return order.items.some(item => {
            // 1. ตรวจจาก sellerProducts ที่เพิ่มเอง
            if (sellerProductIds.includes(String(item.id))) return true;
            // 2. fallback: ตรวจจากชื่อร้านในรายการสินค้า PRODUCTS
            const prod = PRODUCTS.find(p => String(p.id) === String(item.id));
            if (prod && prod.shop === myShopName) return true;
            return false;
        });
    }

    // Calculate stats based on orders that contain seller's products
    let totalRevenue = 0;
    let totalSoldItems = 0;
    let sellerOrdersCount = 0;
    let pendingOrdersCount = 0;

    const lowStockProducts = sellerProducts.filter(p => p.stock > 0 && p.stock <= 5);
    const outOfStockProducts = sellerProducts.filter(p => p.stock === 0);

    state.orders.forEach(order => {
        if (!orderBelongsToSeller(order)) return;

        sellerOrdersCount++;
        if (order.status === 'pending' || order.status === 'shipping') pendingOrdersCount++;

        // คำนวณยอดรวมของออเดอร์นี้เพื่อหาสัดส่วนส่วนลด
        const orderSubtotal = order.items.reduce((s, i) => {
            const price = i.price || (PRODUCTS.find(x => String(x.id) === String(i.id))?.price || 0);
            return s + (price * i.qty);
        }, 0);
        const discountRate = orderSubtotal > 0 ? (order.discount || 0) / orderSubtotal : 0;

        order.items.forEach(item => {
            const isMyProduct = sellerProductIds.includes(String(item.id)) ||
                (() => {
                    const prod = PRODUCTS.find(p => String(p.id) === String(item.id));
                    return prod && prod.shop === myShopName;
                })();
            if (isMyProduct) {
                const basePrice = item.price || (PRODUCTS.find(p => String(p.id) === String(item.id))?.price || 0);
                const itemGross = basePrice * item.qty;
                const itemNet = itemGross * (1 - discountRate);
                totalRevenue += itemNet;
                totalSoldItems += item.qty;
            }
        });
    });

    const avgRating = sellerProducts.length > 0
        ? (sellerProducts.reduce((s, p) => s + (p.rating || 0), 0) / sellerProducts.length).toFixed(1)
        : '0.0';


    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const actualMonthlySales = new Array(12).fill(0);

    state.orders.forEach(order => {
        const hasSellerItem = order.items.some(item => sellerProductIds.includes(String(item.id)));
        if (hasSellerItem && order.date) {
            // คาดหวังฟอร์แมต "ว/ด/ป" เช่น "24/2/2568"
            const parts = order.date.split('/');
            if (parts.length >= 2) {
                const month = parseInt(parts[1]) - 1;
                if (month >= 0 && month < 12) actualMonthlySales[month]++;
            }
        }
    });

    const salesData = actualMonthlySales;
    const maxSale = Math.max(...salesData, 5); // กำหนดขั้นต่ำไว้ที่ 5 เพื่อให้กราฟยังดูสวยถ้ายังขายไม่ได้เลย


    el.innerHTML = `
            <div class="sd-header">
        <h2>📊 ภาพรวมร้านค้า</h2>
        <div style="font-size:13px;color:var(--text-3)">${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>

    <!-- ⚡ รายการที่ต้องเร่งจัดการ(Actions Required) -->
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:24px">
        <div style="background:#fff4e5; padding:20px; border-radius:16px; border:1px solid #ffd180">
            <h4 style="color:#e65100; margin-bottom:10px; display:flex; align-items:center; gap:8px">🔔 สิ่งที่ต้องทำวันนี้</h4>
            <div style="display:flex; flex-direction:column; gap:12px">
                <div style="display:flex; justify-content:space-between; align-items:center">
                    <span style="font-size:13px">คำสั่งซื้อที่รอจัดส่ง</span>
                    <b style="font-size:18px; color:#e65100">${pendingOrdersCount}</b>
                </div>
                <button class="btn-sd btn-sd-primary" style="width:100%; padding:8px; font-size:12px" onclick="sdTab('orders')">📦 จัดการคำสั่งซื้อ</button>
            </div>
        </div>
        <div style="background:#fce4ec; padding:20px; border-radius:16px; border:1px solid #f8bbd0">
            <h4 style="color:#c2185b; margin-bottom:10px; display:flex; align-items:center; gap:8px">⚠️ สินค้าใกล้หมด/หมด</h4>
            <div style="display:flex; flex-direction:column; gap:12px">
                <div style="display:flex; justify-content:space-between; align-items:center">
                    <span style="font-size:13px">ใกล้หมด (${lowStockProducts.length}) | หมด (${outOfStockProducts.length})</span>
                    <b style="font-size:18px; color:#c2185b">${lowStockProducts.length + outOfStockProducts.length}</b>
                </div>
                <button class="btn-sd btn-sd-danger" style="width:100%; padding:8px; font-size:12px" onclick="sdTab('products')">🔍 ตรวจสอบสต็อก</button>
            </div>
        </div>
    </div>

    <div class="sd-stats">
        <div class="stat-card"><div class="stat-icon">📦</div><div><div class="stat-value">${sellerProducts.length}</div><div class="stat-label">สินค้าทั้งหมด</div></div></div>
        <div class="stat-card"><div class="stat-icon">🛒</div><div><div class="stat-value">${totalSoldItems.toLocaleString()}</div><div class="stat-label">ยอดขาย (ชิ้น)</div></div></div>
        <div class="stat-card"><div class="stat-icon">💰</div><div><div class="stat-value">฿${totalRevenue.toLocaleString()}</div><div class="stat-label">รายได้รวม</div></div></div>
        <div class="stat-card"><div class="stat-icon">⭐</div><div><div class="stat-value">${avgRating}</div><div class="stat-label">คะแนนร้านค้า</div></div></div>
    </div>
    
    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:24px; margin-top:24px">
        <div class="sd-chart" style="margin-top:0">
            <h3>📈 ยอดขายรายเดือน (ปี 2568)</h3>
            <div class="chart-bars">
                ${salesData.map((v, i) => `
                <div class="chart-bar-wrap">
                    <div class="chart-bar" style="height:${Math.round(v / maxSale * 100)}px" title="${v} คำสั่งซื้อ"></div>
                    <div class="chart-label">${months[i]}</div>
                </div>`).join('')}
            </div>
        </div>
        
        <div class="sd-section" style="margin-top:0">
             <h3 style="margin-bottom:14px;font-size:15px;font-weight:700">📦 สินค้าขายดี</h3>
             <div style="display:flex; flex-direction:column; gap:12px">
                 ${[...sellerProducts].map(p => {
        const realSold = state.orders.reduce((sum, order) => {
            const matches = order.items?.filter(i => String(i.id) === String(p.id)) || [];
            return sum + matches.reduce((s, m) => s + m.qty, 0);
        }, 0);
        return { ...p, realSold };
    }).sort((a, b) => b.realSold - a.realSold).slice(0, 3).map(p => `
                    <div style="display:flex; align-items:center; gap:10px; padding-bottom:10px; border-bottom:1px solid #f0f0f0">
                        <span style="font-size:24px">${p.emoji}</span>
                        <div style="flex:1">
                            <div style="font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100px">${p.name}</div>
                            <div style="font-size:11px; color:var(--primary)">ขายแล้ว ${p.realSold} ชิ้น</div>
                        </div>
                    </div>
                 `).join('')}
                 ${sellerProducts.length === 0 ? '<p style="font-size:12px;color:#999;text-align:center">ยังไม่มีข้อมูล</p>' : ''}
             </div>
        </div>
    </div>`;
}

/**
 * บีบอัดและปรับขนาดรูปภาพให้เป็นสี่เหลี่ยมจัตุรัส
 */
async function processProductImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const size = 400; // ขนาดมาตรฐาน 400x400 px
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');

                // คำนวณการตัดรูปให้เป็นสี่เหลี่ยมจัตุรัส (Crop to Square)
                let sx, sy, sSide;
                if (img.width > img.height) {
                    sSide = img.height;
                    sx = (img.width - img.height) / 2;
                    sy = 0;
                } else {
                    sSide = img.width;
                    sx = 0;
                    sy = (img.height - img.width) / 2;
                }

                ctx.drawImage(img, sx, sy, sSide, sSide, 0, 0, size, size);

                // บีบอัดเป็น JPEG คุณภาพ 0.7 (70%)
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function renderSdProducts(el) {
    el.innerHTML = `
        <div class="sd-header">
        <h2>📦 สินค้าของฉัน</h2>
        <button class="btn-sd btn-sd-primary" onclick="sdTab('add')">➕ เพิ่มสินค้าใหม่</button>
    </div>
        ${sellerProducts.length === 0
            ? `<div class="sd-empty"><div class="sd-empty-icon">📭</div><h3>ยังไม่มีสินค้า</h3><p>เริ่มเพิ่มสินค้าชิ้นแรกของคุณเลย!</p><button class="btn-sd btn-sd-primary" style="margin-top:12px" onclick="sdTab('add')">➕ เพิ่มสินค้า</button></div>`
            : `<table class="sd-table">
            <thead><tr><th>สินค้า</th><th>ราคา</th><th>หมวดหมู่</th><th>สต็อก</th><th>ขายแล้ว</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>
            ${sellerProducts.map(p => {
                const realSold = state.orders.reduce((sum, order) => {
                    const matches = order.items?.filter(i => String(i.id) === String(p.id)) || [];
                    return sum + matches.reduce((s, m) => s + m.qty, 0);
                }, 0);
                return `<tr>
                <td style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:24px">${p.emoji}</span>
                    <span style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</span>
                </td>
                <td style="color:var(--primary);font-weight:600">฿${p.price.toLocaleString()}</td>
                <td>${getCatName(p.category)}</td>
                <td>${p.stock}</td>
                <td>${realSold.toLocaleString()}</td>
                <td><span class="product-status ${p.stock > 0 ? 'ps-active' : 'ps-inactive'}">${p.stock > 0 ? 'วางขาย' : 'หมดสต็อก'}</span></td>
                <td style="display:flex;gap:6px">
                    <button class="btn-sd btn-sd-outline" onclick="editProduct(${p.id})">✏️ แก้ไข</button>
                    <button class="btn-sd btn-sd-danger" onclick="deleteProduct(${p.id})">🗑️</button>
                </td>
            </tr>`;
            }).join('')}
            </tbody>
        </table>`
        } `;
}

function renderSdAddForm(el, editId) {
    editingProductId = editId;
    const p = editId ? sellerProducts.find(x => x.id === editId) : null;
    selectedEmoji = p ? p.emoji : '📦';
    const emojis = ['📦', '📱', '💻', '🎧', '👗', '👔', '👟', '💄', '🧴', '✨', '🏡', '🛋️', '☕', '⚽', '🏋️', '🧸', '📚', '🚗', '🐾', '🍜', '🍕', '🥤', '💍', '🎮', '🎵', '🌸', '🎁', '🔧', '⌚', '👜'];

    // 🖼️ เก็บค่ารูปภาพปัจจุบัน (ถ้ามี 4 รูป)
    window.tempProductImages = p?.images || (p?.image ? [p.image] : [null, null, null, null]);
    // ยืนยันว่าต้องมี 4 ช่อง
    while (window.tempProductImages.length < 4) window.tempProductImages.push(null);

    el.innerHTML = `
        <div class="sd-header">
        <h2>${editId ? '✏️ แก้ไขสินค้า' : '➕ เพิ่มสินค้าใหม่'}</h2>
        <button class="btn-sd btn-sd-outline" onclick="sdTab('products')">← กลับ</button>
    </div>
        <div class="sd-form">
            <h3>📋 ข้อมูลสินค้า</h3>
            
            <div style="background:#f8f9fa; padding:20px; border-radius:12px; margin-bottom:20px; border:1px solid #eee">
                <label style="display:block; margin-bottom:12px; font-weight:600">รูปภาพสินค้า (สูงสุด 4 รูป)</label>
                <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px">
                    ${[0, 1, 2, 3].map(i => `
                        <div id="sp-img-preview-${i}" onclick="document.getElementById('sp-img-file-${i}').click()" 
                             style="aspect-ratio:1; border-radius:10px; border:2px dashed #ccc; background:#fff; display:flex; align-items:center; justify-content:center; overflow:hidden; cursor:pointer; position:relative">
                            ${window.tempProductImages[i] ? `<img src="${window.tempProductImages[i]}" style="width:100%; height:100%; object-fit:cover">` : `<span style="font-size:24px; color:#ccc">+</span>`}
                            <input type="file" id="sp-img-file-${i}" accept="image/*" style="display:none" onchange="handleProductImage(this, ${i})">
                        </div>
                    `).join('')}
                </div>
                <p style="font-size:11px; color:#777; margin-top:10px">กดที่ช่องเพื่อเปลี่ยนรูป (บีบอัดและปรับขนาด 400x400 อัตโนมัติ)</p>
            </div>

            <div class="form-group">
                <label>ไอคอนสำรอง (ใช้อ้างอิงหมวดหมู่)</label>
                <div class="emoji-picker" id="emoji-picker">
                    ${emojis.map(e => `<div class="emoji-opt${e === selectedEmoji ? ' active' : ''}" onclick="pickEmoji(this,'${e}')">${e}</div>`).join('')}
                </div>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="form-group">
                    <label>รหัสสินค้า (SKU) <small style="color:#999">(ถ้าว่างไว้ระบบจะสร้างให้)</small></label>
                    <input id="sp-sku" placeholder="เช่น SN-001" value="${p?.sku || ''}" />
                </div>
                <div class="form-group">
                    <label>ชื่อสินค้า *</label>
                    <input id="sp-name" placeholder="ชื่อสินค้า... (รายละเอียดชัดเจน)" value="${p?.name || ''}" />
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="form-group">
                    <label>ราคาปกติ (฿) *</label>
                    <input type="number" id="sp-price" placeholder="0" value="${p?.price || ''}" min="0" />
                </div>
                <div class="form-group">
                    <label>ราคาก่อนลด (฿)</label>
                    <input type="number" id="sp-original-price" placeholder="0 (ถ้ามีส่วนลด)" value="${p?.originalPrice || ''}" min="0" />
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="form-group">
                    <label>จำนวนสต็อก *</label>
                    <input type="number" id="sp-stock" placeholder="0" value="${p?.stock || ''}" min="0" />
                </div>
                <div class="form-group">
                    <label>หมวดหมู่ *</label>
                    <select id="sp-category">
                        ${[['electronics', '📱 อิเล็กทรอนิกส์'], ['fashion', '👗 แฟชั่น'], ['beauty', '💄 ความงาม'], ['home', '🏡 บ้าน'], ['sports', '⚽ กีฬา'], ['food', '🍜 อาหาร'], ['toys', '🧸 ของเล่น'], ['books', '📚 หนังสือ'], ['auto', '🚗 ยานพาหนะ'], ['pets', '🐾 สัตว์เลี้ยง']].map(([v, l]) => `<option value="${v}"${p?.category === v ? ' selected' : ''}>${l}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>รายละเอียดสินค้า</label>
                <textarea id="sp-desc" rows="4" placeholder="อธิบายสินค้า จุดเด่น วัสดุ การใช้งาน...">${p?.desc || ''}</textarea>
            </div>
            <div class="form-group">
                <label>รายละเอียดตัวเลือกสินค้า <small style="color:#e67e22">(เช่น หัวข้อ: ความจุ, ตัวเลือกในตาราง: 64GB, 128GB)</small></label>
                <div style="background:#fff; border:1px solid #ddd; border-radius:12px; padding:15px">
                    <div class="form-group" style="margin-bottom:12px">
                        <label style="font-size:12px; color:#666">ชื่อหัวข้อตัวเลือก (เช่น สี, ขนาด, ความจุ)</label>
                        <input id="sp-option-title" placeholder="เช่น ความจุ" value="${p?.optionTitle || 'ตัวเลือก'}" />
                    </div>
                    
                    <div id="variation-container">
                        <div style="display:grid; grid-template-columns: 1fr 120px 40px; gap:8px; margin-bottom:8px; font-size:12px; font-weight:600; color:#888">
                            <div>ชื่อตัวเลือกย่อย</div>
                            <div>ราคา (฿)</div>
                            <div></div>
                        </div>
                        <div id="variation-list">
                            ${p?.variations && p.variations.length > 0
            ? p.variations.map(v => `
                                    <div class="variation-row" style="display:grid; grid-template-columns: 1fr 120px 40px; gap:8px; margin-bottom:8px">
                                        <input class="sp-var-name" placeholder="เช่น 64GB" value="${v.name}" />
                                        <input type="number" class="sp-var-price" placeholder="ราคา" value="${v.price}" />
                                        <button class="btn-sd btn-sd-outline" onclick="this.parentElement.remove()" style="padding:0; border-color:#ff7675; color:#ff7675">🗑️</button>
                                    </div>
                                `).join('')
            : `
                                    <div class="variation-row" style="display:grid; grid-template-columns: 1fr 120px 40px; gap:8px; margin-bottom:8px">
                                        <input class="sp-var-name" placeholder="เช่น 64GB" value="" />
                                        <input type="number" class="sp-var-price" placeholder="ราคา" value="" />
                                        <button class="btn-sd btn-sd-outline" onclick="this.parentElement.remove()" style="padding:0; border-color:#ff7675; color:#ff7675">🗑️</button>
                                    </div>
                                `
        }
                        </div>
                        <button class="btn-sd btn-sd-outline" style="width:100%; border-style:dashed; margin-top:5px" onclick="addVariationRow()">➕ เพิ่มตัวเลือกย่อย</button>
                    </div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div class="form-group">
                    <label>แท็ก (แสดง Badge 'ใหม่' อัตโนมัติ)</label>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
                        ${['top', 'new', 'flash'].map(t => `<label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" value="${t}" class="sp-tag" ${p?.tags?.includes(t) ? 'checked' : ''}> ${t === 'top' ? '🏆 ยอดนิยม' : t === 'new' ? '✨ ใหม่' : '⚡ Flash Sale'}</label>`).join('')}
                    </div>
                </div>
                <div class="form-group">
                    <label>Badge ร้านค้า (เช่น Official, Mall)</label>
                    <input id="sp-shop-badge" placeholder="ปล่อยว่างถ้าไม่มี" value="${p?.shopBadge || ''}" />
                </div>
            </div>
            <div class="form-group">
                <label>ชื่อร้านค้า</label>
                <input id="sp-shop" placeholder="ชื่อร้านค้าของคุณ" value="${p?.shop || (state.user.shopName || state.user.name + ' Shop')}" />
            </div>
            <div style="display:flex;gap:12px;margin-top:8px">
                <button class="btn-sd btn-sd-primary" style="flex:1;padding:14px;font-size:15px" onclick="saveProduct()">${editId ? '💾 บันทึกการแก้ไข' : '✅ เพิ่มสินค้า'}</button>
                <button class="btn-sd btn-sd-outline" style="padding:14px 24px" onclick="sdTab('products')">ยกเลิก</button>
            </div>
        </div>`;
}

/**
 * จัดการเมื่อมีการเลือกรูป
 */
async function handleProductImage(input, index) {
    if (input.files && input.files[0]) {
        try {
            showToast('info', '⌛ กำลังประมวลผลรูปที่ ' + (index + 1) + '...');
            const processed = await processProductImage(input.files[0]);

            if (!window.tempProductImages) window.tempProductImages = [null, null, null, null];
            window.tempProductImages[index] = processed;

            const preview = document.getElementById(`sp-img-preview-${index}`);
            if (preview) {
                preview.innerHTML = `<img src="${processed}" style="width:100%; height:100%; object-fit:cover">`;
            }
            showToast('success', '✅ ประมวลผลรูปสำเร็จ!');
        } catch (err) {
            console.error(err);
            showToast('error', '❌ ไม่สามารถประมวลผลรูปภาพได้');
        }
    }
}

/**
 * เพิ่มแถวตัวเลือกใหม่ในตาราง
 */
window.addVariationRow = function () {
    const list = document.getElementById('variation-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'variation-row';
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1fr 120px 40px';
    row.style.gap = '8px';
    row.style.marginBottom = '8px';
    row.innerHTML = `
        <input class="sp-var-name" placeholder="เช่น 64GB" value="" />
        <input type="number" class="sp-var-price" placeholder="ราคา" value="" />
        <button class="btn-sd btn-sd-outline" onclick="this.parentElement.remove()" style="padding:0; border-color:#ff7675; color:#ff7675">🗑️</button>
    `;
    list.appendChild(row);
}

function pickEmoji(el, emoji) {
    document.querySelectorAll('.emoji-opt').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    selectedEmoji = emoji;

}

async function saveProduct() {
    const sku = document.getElementById('sp-sku')?.value.trim();
    const name = document.getElementById('sp-name')?.value.trim();
    const price = parseFloat(document.getElementById('sp-price')?.value);
    const stock = parseInt(document.getElementById('sp-stock')?.value);
    const category = document.getElementById('sp-category')?.value;
    const desc = document.getElementById('sp-desc')?.value.trim();
    const originalPrice = parseFloat(document.getElementById('sp-original-price')?.value) || null;
    const shop = document.getElementById('sp-shop')?.value.trim() || (state.user.shopName || (state.user.name + ' Shop'));
    let optionTitle = document.getElementById('sp-option-title')?.value.trim() || 'ตัวเลือก';
    let options = [];
    let variations = [];

    // ดึงข้อมูลจากตารางตัวเลือก
    document.querySelectorAll('.variation-row').forEach(row => {
        const vNameInput = row.querySelector('.sp-var-name');
        const vPriceInput = row.querySelector('.sp-var-price');
        const vName = vNameInput ? vNameInput.value.trim() : '';
        const vPrice = vPriceInput ? parseFloat(vPriceInput.value) : NaN;

        if (vName) {
            variations.push({
                name: vName,
                price: isNaN(vPrice) ? price : vPrice
            });
            options.push(vName);
        }
    });

    // Fallback: หากไม่ได้ระบุในตาราง ให้สร้างตัวเลือกเริ่มต้น
    if (variations.length === 0) {
        variations.push({ name: 'ค่าเริ่มต้น', price: price });
        options.push('ค่าเริ่มต้น');
    }

    const shopBadge = document.getElementById('sp-shop-badge')?.value.trim() || state.user?.shopBadge || '';
    const tags = [...document.querySelectorAll('.sp-tag:checked')].map(c => c.value);

    // กำหนด Badge อัตโนมัติ
    let badge = null;
    if (originalPrice && originalPrice > price) badge = 'sale';
    else if (tags.includes('new')) badge = 'new';
    else if (tags.includes('top')) badge = 'hot';

    if (!name) { showToast('error', '❌ กรุณาใส่ชื่อสินค้า'); return; }
    if (!price || price <= 0) { showToast('error', '❌ กรุณาใส่ราคาที่ถูกต้อง'); return; }
    if (!stock && (stock !== 0)) { showToast('error', '❌ กรุณาใส่จำนวนสต็อก'); return; }

    const finalSku = sku || ('SN-' + Math.random().toString(36).substr(2, 6).toUpperCase());

    let pData;
    const finalImages = window.tempProductImages ? window.tempProductImages.filter(img => img !== null) : [];

    if (editingProductId) {
        const idx = sellerProducts.findIndex(p => String(p.id) === String(editingProductId));
        if (idx >= 0) {
            pData = { ...sellerProducts[idx], sku: finalSku, name, price, stock, category, desc, shop, shopBadge, tags, badge, optionTitle, options, variations, emoji: selectedEmoji, images: finalImages, image: finalImages[0] || null };
            sellerProducts[idx] = pData;
            showToast('success', '✅ แก้ไขสินค้าเรียบร้อย!');
        }
    } else {
        const newId = Date.now();
        pData = { id: newId, sku: finalSku, name, price, originalPrice, stock, category, desc, shop, shopBadge, tags, badge, optionTitle, options, variations, emoji: selectedEmoji, images: finalImages, image: finalImages[0] || null, rating: 5.0, sold: 0, reviews: [], specs: {} };
        sellerProducts.push(pData);
        showToast('success', '🎉 เพิ่มสินค้าใหม่สำเร็จ!');
    }

    // ☁️ บันทึกขึ้น Cloud ทันที
    if (await isOnline()) await saveOnlineProduct(pData);

    await saveSellerProducts();
    editingProductId = null;
    sdTab('products');
}

function editProduct(id) {
    const content = document.getElementById('seller-content');
    if (content) renderSdAddForm(content, id);
    document.querySelectorAll('.seller-nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.getElementById('snav-add');
    if (navEl) navEl.classList.add('active');
}

async function deleteProduct(id) {
    if (!confirm('ต้องการลบสินค้านี้?')) return;

    // ☁️ ลบใน Cloud
    if (await isOnline()) await deleteOnlineProduct(id);

    sellerProducts = sellerProducts.filter(p => p.id !== id);
    const pidx = PRODUCTS.findIndex(p => p.id === id);
    if (pidx >= 0) PRODUCTS.splice(pidx, 1);

    await saveSellerProducts();
    renderFlashProducts(); renderFeaturedProducts(); renderNewProducts(); renderAllProducts();
    showToast('warning', '🗑️ ลบสินค้าแล้ว');
    sdTab('products');
}

function renderSdOrders(el) {
    // แปลง IDs เป็น string ทั้งหมดเพื่อให้เปรียบเทียบง่ายขึ้น
    const sellerProductIds = sellerProducts.map(p => String(p.id));
    const myShopName = state.user?.shopName || (state.user?.name + "'s Shop");

    function isMyProduct(itemId) {
        if (sellerProductIds.includes(String(itemId))) return true;
        const prod = PRODUCTS.find(p => String(p.id) === String(itemId));
        return prod && prod.shop === myShopName;
    }

    // กรองเฉพาะออเดอร์ที่มีสินค้าของร้านนี้
    const sellerOrders = state.orders.filter(order =>
        order.items.some(item => isMyProduct(item.id))
    );

    el.innerHTML = `
            <div class="sd-header">
        <h2>🛒 รายการสั่งซื้อของฉัน</h2>
        <div style="font-size:13px;color:var(--text-3)">พบ ${sellerOrders.length} รายการ</div>
    </div>
        ${sellerOrders.length === 0
            ? '<div class="sd-empty"><div class="sd-empty-icon">📭</div><h3>ยังไม่มีคำสั่งซื้อเข้ามา</h3><p>เมื่อลูกค้าสั่งซื้อสินค้าของคุณ คำสั่งซื้อจะปรากฏที่นี่</p></div>'
            : `<table class="sd-table">
            <thead><tr><th>หมายเลข</th><th>วันที่</th><th>สินค้า (ของคุณ)</th><th>ยอดรวม (ของคุณ)</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
            <tbody>
            ${sellerOrders.map(o => {
                const statusMap = { pending: 'รอชำระ', shipping: 'จัดส่ง', delivered: 'ส่งแล้ว' };
                const statusClass = { pending: 'status-pending', shipping: 'status-shipping', delivered: 'status-delivered' };

                // คำนวณยอดรวมเฉพาะสินค้าของร้านเราในออเดอร์นี้ (หักส่วนลดตามสัดส่วน)
                const sellerItems = o.items.filter(item => isMyProduct(item.id));

                // คำนวณ subtotal ทั้งออเดอร์ (ก่อนส่วนลด) เพื่อหาสัดส่วน
                const orderSubtotal = o.items.reduce((s, i) => {
                    const prod = PRODUCTS.find(x => String(x.id) === String(i.id));
                    return s + (prod ? prod.price * i.qty : 0);
                }, 0);
                const discountRate = orderSubtotal > 0 ? (o.discount || 0) / orderSubtotal : 0;

                // คำนวณ gross ของร้านเราเพื่อหาสัดส่วนค่าจัดส่ง
                const sellerGross = sellerItems.reduce((sum, item) => {
                    const product = PRODUCTS.find(p => String(p.id) === String(item.id));
                    return sum + (product ? product.price * item.qty : 0);
                }, 0);

                // สัดส่วนที่ร้านเราครอบคลุมในออเดอร์นี้ (0-1)
                const sellerShare = orderSubtotal > 0 ? sellerGross / orderSubtotal : 1;

                // ยอดสินค้าหลังหักส่วนลด + ค่าส่งตามสัดส่วน
                const sellerItemsNet = sellerGross * (1 - discountRate);
                const sellerShipping = Math.round((o.shipping || 0) * sellerShare);
                const sellerSubtotal = sellerItemsNet + sellerShipping;

                return `<tr>
                    <td style="font-size:12px;font-family:monospace">${o.id}<br><span style="color:#999;font-size:10px">${o.address?.split(' | ')[0] || ''}</span></td>
                    <td style="font-size:12px">${o.date}</td>
                    <td>
                        <div style="font-size:11px;color:#666">${sellerItems.length} รายการ</div>
                        ${sellerItems.map(si => {
                    const p = PRODUCTS.find(px => String(px.id) === String(si.id));
                    return `<div style="font-size:10px">• ${p?.name.substring(0, 15)}... (x${si.qty})</div>`;
                }).join('')}
                    </td>
                    <td style="color:var(--primary);font-weight:700">฿${formatNum(sellerSubtotal)}</td>
                    <td><span class="order-status ${statusClass[o.status] || 'status-shipping'}">${statusMap[o.status] || 'ดำเนินการ'}</span></td>
                    <td>
                        <div style="display:flex;flex-direction:column;gap:5px">
                            <select onchange="updateOrderStatus('${o.id}',this.value)" style="padding:4px;border:1px solid var(--border);border-radius:4px;font-size:11px">
                                <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>รอชำระ</option>
                                <option value="shipping" ${o.status === 'shipping' ? 'selected' : ''}>กำลังส่ง</option>
                                <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>ส่งแล้ว</option>
                            </select>
                            <div style="display:flex;gap:4px">
                                <input id="track-${o.id}" type="text" placeholder="เลขแทร็กกิ้ง" value="${o.trackingNum || ''}" style="width:100px;font-size:11px;padding:4px;border:1px solid var(--border);border-radius:4px">
                                <button class="btn-sd btn-sd-primary" style="padding:4px 8px;font-size:10px" onclick="updateTracking('${o.id}')">💾</button>
                            </div>
                        </div>
                    </td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`
        } `;
}

function updateTracking(orderId) {
    const input = document.getElementById(`track-${orderId}`);
    const trackingNum = input?.value.trim();
    if (!trackingNum) { showToast('warning', '❌ กรุณากรอกเลข Tracking'); return; }

    const idx = state.orders.findIndex(o => String(o.id) === String(orderId));
    if (idx >= 0) {
        state.orders[idx].trackingNum = trackingNum;
        if (state.orders[idx].status === 'pending') {
            state.orders[idx].status = 'shipping'; // อัปเดตสถานะเป็นกำลังส่งอัตโนมัติเมื่อใส่เลข
        }
        saveToStorage();
        showToast('success', '✅ บันทึกเลข Tracking เรียบร้อย');
        sdTab('orders');
    }
}

async function updateOrderStatus(orderId, newStatus) {
    const order = state.orders.find(o => o.id === orderId);
    if (order) {
        order.status = newStatus;
        saveToStorage();
        showToast('success', '✅ อัปเดตสถานะแล้ว');

        // ☁️ Sync ขึ้น Cloud
        await saveOnlineOrder(order);
    }
}

function renderSdSettings(el) {
    el.innerHTML = `
        <div class="sd-header"><h2>⚙️ ตั้งค่าร้านค้า</h2></div>
            <div class="sd-form">
                <h3>🏪 ข้อมูลร้านค้า</h3>
                <div class="form-group"><label>ชื่อร้านค้า</label><input id="ss-shop-name" value="${state.user?.shopName || state.user?.name + ' Shop' || ''}" placeholder="ชื่อร้านค้า" /></div>
                <div class="form-group"><label>คำอธิบายร้าน</label><textarea id="ss-shop-desc" rows="3" placeholder="อธิบายร้านค้าของคุณ...">${state.user?.shopDesc || ''}</textarea></div>
                <div class="form-group"><label>เบอร์โทรร้าน</label><input id="ss-shop-phone" value="${state.user?.phone || ''}" placeholder="08X-XXX-XXXX" /></div>
                <div class="form-group"><label>ที่อยู่สำหรับรับสินค้า</label><input id="ss-shop-addr" value="${state.user?.shopAddr || ''}" placeholder="ที่อยู่สำหรับรับพัสดุ" /></div>
                <div class="form-group"><label>ธนาคารรับโอน</label>
                    <select id="ss-bank"><option>กสิกรไทย</option><option>ไทยพาณิชย์</option><option>กรุงเทพ</option><option>กรุงไทย</option><option>ทหารไทย</option><option>PromptPay</option></select>
                </div>
                <div class="form-group"><label>เลขบัญชี / พร้อมเพย์</label><input id="ss-bank-num" placeholder="XXX-X-XXXXX-X" /></div>
                <div class="form-group"><label>Badge ร้านค้า (เช่น Official, Mall)</label><input id="ss-shop-badge" value="${state.user?.shopBadge || ''}" placeholder="แสดงป้ายพิเศษหน้าร้าน" /></div>
                <div class="form-group"><label>ตัวเลือกสินค้าเริ่มต้น (เช่น สี / รุ่น)</label><input id="ss-default-options" value="${state.user?.defaultOptions || 'ดำ, ขาว, เงิน, ทอง'}" placeholder="แยกด้วยเครื่องหมายจุลภาค ," /></div>
                <button class="btn-sd btn-sd-primary" style="padding:14px 32px;font-size:15px" onclick="saveShopSettings()">💾 บันทึกการตั้งค่า</button>
            </div>`;
}

function saveShopSettings() {
    state.user.shopName = document.getElementById('ss-shop-name')?.value || state.user.shopName;
    state.user.shopDesc = document.getElementById('ss-shop-desc')?.value;
    state.user.shopAddr = document.getElementById('ss-shop-addr')?.value;
    state.user.shopBadge = document.getElementById('ss-shop-badge')?.value.trim();
    state.user.defaultOptions = document.getElementById('ss-default-options')?.value.trim();
    saveToStorage();
    const nameEl = document.getElementById('sd-shop-name');
    if (nameEl) nameEl.textContent = state.user.shopName;
    showToast('success', '✅ บันทึกการตั้งค่าร้านสำเร็จ!');
}

function getCatName(cat) {
    const catNames = {
        electronics: 'อิเล็กทรอนิกส์', fashion: 'แฟชั่น', beauty: 'ความงาม',
        home: 'บ้าน', sports: 'กีฬา', food: 'อาหาร', toys: 'ของเล่น',
        books: 'หนังสือ', auto: 'ยานพาหนะ', pets: 'สัตว์เลี้ยง',
        flash: 'Flash Sale', top: 'ฮิต', new: 'ใหม่'
    };
    return catNames[cat] || cat;
}

function formatNum(num) {
    if (num === undefined || num === null) return "0";
    return num.toLocaleString();
}

function renderSdVouchers(el) {
    const shopName = state.user.shopName || `${state.user.name} Shop`;
    const myVouchers = (state.vouchers || []).filter(v => v.shop === shopName);

    el.innerHTML = `
    <div class="sd-header">
        <h2>🎟️ คูปองร้านค้า</h2>
        <button class="btn-sd btn-sd-primary" onclick="showVoucherForm()">+ สร้างคูปองใหม่</button>
    </div>
    
    <div class="sd-section">
        <table class="sd-table">
            <thead><tr><th>รหัส</th><th>รายละเอียด</th><th>ส่วนลด</th><th>ขั้นต่ำ</th><th>จัดการ</th></tr></thead>
            <tbody>
                ${myVouchers.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:#999">ยังไม่มีคูปอง</td></tr>' :
            myVouchers.map(v => `
                <tr>
                    <td><b style="color:var(--primary)">${v.code}</b></td>
                    <td>${v.desc}</td>
                    <td>฿${formatNum(v.discount)}</td>
                    <td>฿${formatNum(v.minOrder)}</td>
                    <td><button class="btn-sd btn-sd-danger" onclick="deleteShopVoucher('${v.code}')">ลบ</button></td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>

    <div id="voucher-form" style="display:none; margin-top:20px; background:#fff; padding:20px; border-radius:12px; border:1px dashed var(--primary)">
        <h3 style="margin-bottom:15px">🆕 สร้างคูปองใหม่</h3>
        <div class="form-row">
            <div class="form-group"><label>รหัสคูปอง (เช่น SALE10)</label><input id="v-code" /></div>
            <div class="form-group"><label>ส่วนลด (บาท)</label><input id="v-discount" type="number" /></div>
        </div>
        <div class="form-group"><label>ขั้นต่ำในการสั่งซื้อ</label><input id="v-min" type="number" /></div>
        <div class="form-group"><label>คำอธิบาย</label><input id="v-desc" placeholder="เช่น ลด 10 บาท เมื่อช้อปครบ 100" /></div>
        <button class="btn-sd btn-sd-primary" onclick="saveShopVoucher()">บันทึกคูปอง</button>
    </div>`;
}

function showVoucherForm() {
    document.getElementById('voucher-form').style.display = 'block';
}

async function saveShopVoucher() {
    const code = document.getElementById('v-code').value.trim().toUpperCase();
    const discount = parseInt(document.getElementById('v-discount').value);
    const minOrder = parseInt(document.getElementById('v-min').value);
    const desc = document.getElementById('v-desc').value.trim();

    if (!code || isNaN(discount)) { showToast('error', '❌ ข้อมูลไม่ครบ'); return; }

    const shopName = state.user.shopName || `${state.user.name} Shop`;
    const vData = { code, discount, minOrder: minOrder || 0, desc, shop: shopName };

    // ☁️ บันทึกลง Cloud
    await saveOnlineVoucher(vData);

    state.vouchers.push(vData);
    saveToStorage();
    showToast('success', '✅ สร้างคูปองสำเร็จ');
    sdTab('vouchers');
}

async function deleteShopVoucher(code) {
    if (!confirm('ยืนยันการลบคูปองนี้?')) return;

    // ☁️ ลบใน Cloud
    await deleteOnlineVoucher(code);

    state.vouchers = state.vouchers.filter(v => v.code !== code);
    saveToStorage();
    sdTab('vouchers');
}

function renderSdShipping(el) {
    if (!state.user.shipSettings) state.user.shipSettings = { shipFee: 40, freeShipMin: 1000 };
    const s = state.user.shipSettings;

    el.innerHTML = `
    <div class="sd-header">
        <h2>🚚 ตั้งค่าการจัดส่ง</h2>
    </div>
    <div class="sd-section" style="max-width:500px">
        <div class="form-group">
            <label>ค่าจัดส่งเริ่มต้น (บาท)</label>
            <input id="ship-fee" type="number" value="${s.shipFee}" />
        </div>
        <div class="form-group">
            <label>ส่งฟรีเมื่อซื้อครบ (บาท)</label>
            <input id="ship-free-min" type="number" value="${s.freeShipMin}" />
        </div>
        <div class="form-group">
            <label>บริษัทขนส่งที่รองรับ</label>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:8px">
                <label><input type="checkbox" checked disabled> Kerry Express</label>
                <label><input type="checkbox" checked disabled> Flash Express</label>
                <label><input type="checkbox" checked disabled> J&T Express</label>
                <label><input type="checkbox" checked disabled> ไปรษณีย์ไทย</label>
            </div>
        </div>
        <button class="btn-sd btn-sd-primary" style="width:100%;margin-top:20px" onclick="saveShipSettings()">💾 บันทึกการตั้งค่าจัดส่ง</button>
    </div>`;
}

function saveShipSettings() {
    state.user.shipSettings = {
        shipFee: parseInt(document.getElementById('ship-fee').value) || 0,
        freeShipMin: parseInt(document.getElementById('ship-free-min').value) || 0
    };
    saveToStorage();
    showToast('success', '✅ บันทึกการตั้งค่าการจัดส่งแล้ว');
}

