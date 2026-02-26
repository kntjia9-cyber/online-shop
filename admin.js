// ===== ADMIN STATE =====
let adminState = {
    currentUser: null,
    currentTab: 'dash'
};

let globalState = {
    users: [],
    allProducts: [],
    orders: [],
    banners: [],
    vouchers: []
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    updateCloudStatus('connecting');

    // ☁️ ย้ายข้อมูลเดิมขึ้น Cloud (สำคัญมาก: เพื่อให้สมาชิกในเครื่องขึ้นโหมดออนไลน์)
    await migrateToCloud();

    // โหลดข้อมูลเบื้องต้นจาก Cloud
    await loadData();
    checkAuth();

    const online = await isOnline();
    updateCloudStatus(online ? 'connected' : 'offline');

    // ✅ เพิ่มระบบ Real-time Sync (ถ้าสมัครสมาชิกในหน้าอื่น หน้านี้จะอัปเดตทันที)
    window.addEventListener('storage', async (e) => {
        if (e.key === 'shopnow_users' || e.key === 'shopnow_state' || e.key === 'shopnow_seller_products') {
            await loadData();
            refreshActiveTab();
        }
    });
});

function updateCloudStatus(status) {
    const el = document.getElementById('cloud-status');
    if (!el) return;
    if (status === 'connected') {
        el.innerHTML = '<span style="width:8px; height:8px; background:#2ecc71; border-radius:50%; box-shadow:0 0 5px #2ecc71"></span> Online (Cloud Sync)';
        el.style.color = '#2ecc71';
    } else if (status === 'connecting') {
        el.innerHTML = '<span style="width:8px; height:8px; background:#f1c40f; border-radius:50%"></span> Connecting...';
    } else {
        el.innerHTML = '<span style="width:8px; height:8px; background:#e74c3c; border-radius:50%"></span> Offline Mode';
        el.style.color = '#e74c3c';
    }
}

function refreshActiveTab() {
    const container = document.getElementById('admin-content-area');
    if (adminState.currentTab === 'users') renderAllUsers(container);
    if (adminState.currentTab === 'dash') renderOverview(container);
    if (adminState.currentTab === 'products') renderAllProducts(container);
    if (adminState.currentTab === 'orders') renderPlatformOrders(container);
    if (adminState.currentTab === 'banners') renderBanners(container);
    if (adminState.currentTab === 'vouchers') renderVouchersCRUD(container);
}

async function loadData() {
    console.log('⌛ Loading all data from Cloud...');

    // ☁️ ดึงข้อมูลแบบแยกจากกัน เพื่อไม่ให้ Error ตัวนึงล่มคนอื่น
    const results = await Promise.allSettled([
        fetchOnlineProducts(),
        fetchOnlineOrders(),
        fetchOnlineBanners(),
        fetchOnlineVouchers(),
        fetchOnlineUsers()
    ]);

    // ตรวจสอบผลลัพธ์ทีละตัว
    globalState.allProducts = results[0].status === 'fulfilled' ? results[0].value : [];
    globalState.orders = results[1].status === 'fulfilled' ? results[1].value : [];
    globalState.banners = results[2].status === 'fulfilled' ? results[2].value : [];
    globalState.vouchers = results[3].status === 'fulfilled' ? results[3].value : [];
    const onlineUsers = results[4].status === 'fulfilled' ? results[4].value : [];

    // ดึงรายชื่อสมาชิก: ถ้าออนไลน์มีข้อมูลให้ใช้จากออนไลน์เป็นหลัก
    if (onlineUsers && onlineUsers.length > 0) {
        console.log('👥 Loaded Users from Cloud:', onlineUsers.length);
        globalState.users = onlineUsers;
    } else {
        console.log('🏠 No users found in Cloud, falling back to LocalStorage');
        globalState.users = JSON.parse(localStorage.getItem('shopnow_users') || '[]');
    }

    // ตรวจสอบว่ามี Admin ในรายชื่อหรือยัง ถ้าไม่มีให้เพิ่มหลอกๆ ไว้แสดงผล
    if (adminState.currentUser && !globalState.users.find(u => u.email === adminState.currentUser.email)) {
        globalState.users.unshift(adminState.currentUser);
    }
}

function checkAuth() {
    const savedAdmin = sessionStorage.getItem('admin_session');
    if (savedAdmin) {
        adminState.currentUser = JSON.parse(savedAdmin);
        showDashboard();
    } else {
        document.getElementById('admin-login-screen').style.display = 'flex';
    }
}

async function adminLogin() {
    const email = document.getElementById('adm-email').value;
    const pass = document.getElementById('adm-pass').value;

    if (!email || !pass) return alert('❌ กรุณากรอกข้อมูลให้ครบ');

    // ☁️ ลองเข้าสู่ระบบผ่าน Supabase
    const { data, error } = await signInOnline(email, pass);

    if (error) {
        // Fallback สำหรับ Local Admin
        const user = globalState.users.find(u => u.email === email && u.isAdmin && u.pass === pass);
        if (email === 'houseofstamp@gmail.com' || user) {
            const loggedUser = user || { name: 'Super Admin', email: email, isAdmin: true };
            adminState.currentUser = loggedUser;
            sessionStorage.setItem('admin_session', JSON.stringify(loggedUser));
            showDashboard();
        } else {
            alert('❌ ' + error.message);
        }
    } else {
        const user = data.user;

        // ☁️ ดึงข้อมูล Profile เพิ่มเติมจากตาราง users
        const onlineProfiles = await fetchOnlineUsers();
        const profile = onlineProfiles.find(p => p.email === user.email);

        const loggedUser = {
            id: user.id,
            name: profile?.name || user.user_metadata?.full_name || 'Admin',
            email: user.email,
            isAdmin: profile?.isAdmin || true
        };
        adminState.currentUser = loggedUser;
        sessionStorage.setItem('admin_session', JSON.stringify(loggedUser));
        showDashboard();
    }
}

function showDashboard() {
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-sidebar-el').style.display = 'flex';
    document.getElementById('admin-main-el').style.display = 'block';

    // แสดงชื่อจากโปรไฟล์ที่ล็อกอินเข้ามา
    const adminName = adminState.currentUser.name || 'Admin';
    document.getElementById('admin-profile-info').textContent = `👤 ผู้ดูแล: ${adminName}`;
    goTab('dash');
}

function adminLogout() {
    sessionStorage.removeItem('admin_session');
    location.reload();
}

// ===== NAVIGATION =====
function goTab(tab) {
    adminState.currentTab = tab;
    // Highlight Active Nav
    document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
    const activeNav = document.getElementById('anav-' + tab);
    if (activeNav) activeNav.classList.add('active');

    const container = document.getElementById('admin-content-area');

    const titles = {
        dash: '📊 แดชบอร์ดภาพรวม',
        banners: '🖼️ จัดการแบนเนอร์',
        products: '📦 สินค้าทั้งหมดในระบบ',
        users: '👥 จัดการสมาชิก',
        orders: '💸 รายการสั่งซื้อของแพลตฟอร์ม',
        vouchers: '🎟️ คูปองส่วนลดกลาง'
    };

    document.getElementById('page-title').textContent = titles[tab];

    if (tab === 'dash') renderOverview(container);
    if (tab === 'banners') renderBanners(container);
    if (tab === 'products') renderAllProducts(container);
    if (tab === 'users') renderAllUsers(container);
    if (tab === 'orders') renderPlatformOrders(container);
    if (tab === 'vouchers') renderVouchersCRUD(container);
}

function getCatName(cat) {
    const cats = {
        'electronics': '📱 อิเล็กทรอนิกส์',
        'fashion': '👗 แฟชั่น',
        'beauty': '💄 ความงาม',
        'home': '🏡 บ้าน',
        'sports': '⚽ กีฬา',
        'food': '🍜 อาหาร',
        'toys': '🧸 ของเล่น',
        'books': '📚 หนังสือ',
        'auto': '🚗 ยานพาหนะ',
        'pets': '🐾 สัตว์เลี้ยง'
    };
    return cats[cat] || cat;
}

// ===== RENDERERS =====

function renderOverview(el) {
    const totalRevenue = globalState.orders.reduce((sum, o) => sum + o.total, 0);
    const totalUsers = globalState.users.length;
    const totalProds = globalState.allProducts.length;

    el.innerHTML = `
        <div class="admin-stats">
            <div class="stat-card">
                <div class="stat-title">ยอดขายรวมทั้งแพลตฟอร์ม</div>
                <div class="stat-value">฿${totalRevenue.toLocaleString()}</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">สมาชิกทั้งหมด</div>
                <div class="stat-value">${totalUsers} คน</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">สินค้าทั้งหมด</div>
                <div class="stat-value">${totalProds} รายการ</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">คำสั่งซื้อทั้งหมด</div>
                <div class="stat-value">${globalState.orders.length} ออเดอร์</div>
            </div>
        </div>
        <div style="background:#fff; padding:30px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.05); display:flex; justify-content:space-between; align-items:center">
            <div>
                <h3>🚀 ยินดีต้อนรับสู่ระบบจัดการ ShopNow</h3>
                <p style="color:#666; margin-top:10px">คุณสามารถควบคุมทุกอย่างบนเว็บไซต์ได้จากที่นี่</p>
            </div>
            <button class="btn-adm btn-adm-danger" style="background:#000; color:#fff; border:none; padding:12px 24px" onclick="resetSystem()">⚠️ รีเซ็ตระบบทั้งหมด (Nuclear Reset)</button>
        </div>
    `;
}

async function resetSystem() {
    const confirm1 = confirm('🚨 คำเตือนขั้นเด็ดขาด: คุณกำลังจะลบข้อมูล "ทุกอย่าง" \n- สินค้าทั้งหมด\n- ออเดอร์ทั้งหมด\n- สมาชิกทั้งหมด (ยกเว้นแอดมิน)\n- แบนเนอร์และคูปอง\n\nข้อมูลทั้งในเครื่องและออนไลน์จะหายไปทั้งหมด ต้องการดำเนินการต่อหรือไม่?');
    if (!confirm1) return;

    const confirm2 = confirm('ยืนยันอีกครั้ง: ข้อมูลที่ลบแล้วไม่สามารถกู้คืนได้?');
    if (!confirm2) return;

    showToast('info', '⌛ กำลังล้างฐานข้อมูลออนไลน์...');

    // 1. ล้างออนไลน์
    const success = await resetAllOnlineData();

    if (success) {
        // 2. ล้างในเครื่องให้หมดเกลี้ยง
        localStorage.clear();
        // ป้องกันไม่ให้ระบบแอบเอาข้อมูลเก่าขึ้นไปใหม่
        localStorage.setItem('shopnow_force_clean', 'true');

        showToast('success', '✅ ระบบถูกล้างข้อมูลเรียบร้อยแล้ว');
        alert('🎉 รีเซ็ตระบบเสร็จสิ้น! หน้าเว็บจะรีโหลดใหม่เพื่อเริ่มต้นจากศูนย์');
        window.location.reload();
    } else {
        alert('❌ เกิดข้อผิดพลาดบางประการในการล้างข้อมูลออนไลน์');
    }
}

function renderAllProducts(el) {
    el.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
            <div style="font-size:14px; color:#666">พบสินค้าทั้งหมด <b>${globalState.allProducts.length}</b> รายการ</div>
            <button class="btn-adm btn-adm-danger" style="background:#e74c3c; border:none; padding:8px 16px" onclick="deleteAllProducts()">🗑️ ลบสินค้าทั้งหมด</button>
        </div>
        <div class="sd-table-wrap">
            <table class="sd-table">
                <thead>
                    <tr>
                        <th>รูป</th>
                        <th>หมวดหมู่ / รหัส</th>
                        <th>ราคา</th>
                        <th>ขายแล้ว</th>
                        <th>ร้านค้า</th>
                        <th>โปรโมท</th>
                        <th>จัดการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${globalState.allProducts.map(p => `
                        <tr>
                            <td><div style="font-size:24px">${p.emoji || '📦'}</div></td>
                            <td>
                                <div><b>${p.name}</b></div>
                                <div style="display:flex; gap:8px; margin-top:4px">
                                    <span style="font-size:11px; background:#f0f0f0; padding:2px 6px; border-radius:4px; color:#666">${getCatName(p.category)}</span>
                                    <span style="font-size:11px; background:#e3f2fd; padding:2px 6px; border-radius:4px; color:#1976d2; font-weight:600">SKU: ${p.sku || 'N/A'}</span>
                                </div>
                            </td>
                            <td style="color:#666">฿${p.price.toLocaleString()}</td>
                            <td style="font-weight:600">
                                ${(() => {
            return globalState.orders.reduce((sum, order) => {
                const matches = order.items?.filter(i => String(i.id) === String(p.id)) || [];
                return sum + matches.reduce((s, m) => s + m.qty, 0);
            }, 0);
        })()}
                            </td>
                            <td><span class="badge badge-mall">${p.shop || 'General'}</span></td>
                            <td>
                                <div style="display:flex; gap:10px; align-items:center">
                                    <label style="font-size:11px; cursor:pointer">
                                        <input type="checkbox" ${p.tags?.includes('flash') ? 'checked' : ''} onchange="toggleTag(${p.id}, 'flash')"> ⚡ Flash
                                    </label>
                                    <label style="font-size:11px; cursor:pointer">
                                        <input type="checkbox" ${p.tags?.includes('top') ? 'checked' : ''} onchange="toggleTag(${p.id}, 'top')"> ⭐️ Top
                                    </label>
                                </div>
                            </td>
                            <td>
                                <button class="btn-adm btn-adm-danger" onclick="deleteProduct(${p.id})">ลบ</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderAllUsers(el) {
    if (globalState.users.length === 0) {
        el.innerHTML = `
            <div style="padding:60px; text-align:center; background:#fff; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.05)">
                <div style="font-size:50px; margin-bottom:20px">👥</div>
                <h3>ยังไม่มีสมาชิกใหม่ในระบบ</h3>
                <p style="color:#666; margin-bottom:24px">คุณสามารถรอให้คนมาสมัครที่หน้าเว็บ หรือกดปุ่มด้านล่างเพื่อสร้างข้อมูลตัวอย่าง</p>
                <button class="btn-adm btn-adm-primary" onclick="generateDemoUsers()">✨ สร้างข้อมูลสมาชิกทดสอบ (Demo)</button>
            </div>`;
        return;
    }

    el.innerHTML = `
        <div style="margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap">
             <div style="font-size:14px; color:#666">พบสมาชิกทั้งหมด <b>${globalState.users.length}</b> รายชื่อ</div>
             <div style="display:flex; gap:10px">
                <button class="btn-adm" style="background:#e74c3c; color:#fff; border:none" onclick="clearLocalUsers()">🗑️ ล้างรายชื่อในเครื่องนี้</button>
                <button class="btn-adm" style="background:#2ecc71; color:#fff; border:none" onclick="manualSyncUsers()">☁️ ส่งรายชื่อสมาชิกขึ้น Cloud</button>
             </div>
        </div>
        <div class="sd-table-wrap" style="background:#fff; border-radius:12px; overflow:hidden">
            <table class="sd-table">
                <thead>
                    <tr>
                        <th>ลำดับ</th>
                        <th>ชื่อผู้ใช้งาน</th>
                        <th>ข้อมูลติดต่อ</th>
                        <th>ประเภท</th>
                        <th>จัดการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${globalState.users.map((u, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td><b>${u.name}</b></td>
                            <td>
                                <div>📞 ${u.phone || '-'}</div>
                                <div style="font-size:12px; color:#777">📧 ${u.email || '-'}</div>
                            </td>
                            <td>
                                ${u.isAdmin ? '<span style="background:#ffebee; color:#d32f2f; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:700">SUPER ADMIN</span>'
            : (u.shopName || u.isSeller ?
                '<span style="background:#e3f2fd; color:#1976d2; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:600">🏪 SELLER (ร้านค้า)</span>' :
                '<span style="background:#f5f5f5; color:#666; padding:4px 8px; border-radius:4px; font-size:11px">🛍️ BUYER (ผู้ซื้อ)</span>')}
                            </td>
                            <td>
                                <div style="display:flex; gap:6px">
                                    <button class="btn-adm btn-adm-outline" style="border:1px solid #ddd; background:none; color:#666; padding:6px 10px" onclick="viewUserDetail(${u.id})">🔍 ดู</button>
                                    ${!u.isAdmin ? `<button class="btn-adm btn-adm-danger" style="padding:6px 10px" onclick="banUser(${u.id})">แบน</button>` : ''}
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function generateDemoUsers() {
    const demo = [
        { id: 101, name: 'สมชาย สายช้อป', phone: '081-222-3333', email: 'somchai@test.com', isSeller: false },
        { id: 102, name: 'แม่ค้าใจดี (ShopNow Mall)', phone: '085-999-8888', email: 'shop@beauty.com', shopName: 'Beauty Store', isSeller: true },
        { id: 103, name: 'วิชัย ไอที', phone: '089-111-2222', email: 'vichai@gadget.com', shopName: 'Vichai Gadget', isSeller: true }
    ];

    const currentUsers = JSON.parse(localStorage.getItem('shopnow_users') || '[]');
    // กรองเอาเฉพาะตัวที่ยังไม่มี
    demo.forEach(d => {
        if (!currentUsers.find(u => u.email === d.email)) {
            currentUsers.push(d);
        }
    });

    localStorage.setItem('shopnow_users', JSON.stringify(currentUsers));
    loadData();
    goTab('users');
    alert('✅ สร้างข้อมูลทดสอบ 3 บัญชีเรียบร้อยแล้ว!');
}

async function manualSyncUsers() {
    const localUsers = JSON.parse(localStorage.getItem('shopnow_users') || '[]');
    if (localUsers.length === 0) return alert('❌ ไม่พบข้อมูลสมาชิกในเครื่องนี้');

    if (!confirm(`คุณต้องการส่งรายชื่อสมาชิกทั้ง ${localUsers.length} รายชื่อขึ้นระบบออนไลน์ใช่หรือไม่?`)) return;

    showToast('info', '⌛ กำลังส่งข้อมูลสมาชิกขึ้น Cloud...');
    let successCount = 0;
    for (const u of localUsers) {
        try {
            await saveOnlineUser(u);
            successCount++;
        } catch (e) { console.error(e); }
    }

    await loadData();
    renderAllUsers(document.getElementById('admin-content-area'));
    alert(`✅ ซิงค์สำเร็จ! ส่งขึ้นออนไลน์แล้ว ${successCount} รายชื่อ`);
}

async function clearLocalUsers() {
    if (!confirm('คุณแน่ใจว่าต้องการล้างรายชื่อสมาชิก "ในเครื่องนี้" ทั้งหมด?\nรายชื่อที่ยังไม่ได้ส่งขึ้น Cloud จะหายไปถาวร')) return;
    localStorage.removeItem('shopnow_users');
    await loadData();
    renderAllUsers(document.getElementById('admin-content-area'));
    alert('✅ ล้างรายชื่อในเครื่องเรียบร้อยแล้ว');
}

function viewUserDetail(id) {
    const u = globalState.users.find(user => String(user.id) === String(id));
    if (!u) return;

    // คำนวณสถิติเบื้องต้น
    const userOrders = globalState.orders.filter(o => o.address && o.address.includes(u.phone));
    const totalSpent = userOrders.reduce((sum, o) => sum + o.total, 0);

    // สินค้าที่เป็นของเขา (ถ้าเป็น Seller)
    const userProds = globalState.allProducts.filter(p =>
        p.shop === u.shopName ||
        p.shop === u.name + "'s Shop" ||
        p.shop === u.name + " Shop" ||
        p.shop === u.name + "'s Store"
    );
    const userProdIds = userProds.map(p => String(p.id));

    // คำนวณยอดขายรวมของร้านนี้ (Net Sales - หักส่วนลดตามสัดส่วน)
    let totalSales = 0;
    globalState.orders.forEach(order => {
        if (!order.items) return;

        // คำนวณยอดรวมของออเดอร์นี้ก่อนหักส่วนลด เพื่อหาสัดส่วนส่วนลด
        const orderSubtotal = order.items.reduce((s, i) => {
            const prod = globalState.allProducts.find(x => String(x.id) === String(i.id));
            return s + (prod ? prod.price * i.qty : 0);
        }, 0);

        const discountRate = orderSubtotal > 0 ? (order.discount || 0) / orderSubtotal : 0;

        order.items.forEach(item => {
            if (userProdIds.includes(String(item.id))) {
                const p = globalState.allProducts.find(x => String(x.id) === String(item.id));
                if (p) {
                    const itemGross = p.price * item.qty;
                    const itemNet = itemGross * (1 - discountRate);
                    totalSales += itemNet;
                }
            }
        });
    });

    const avgRating = userProds.length > 0
        ? (userProds.reduce((s, p) => s + (p.rating || 0), 0) / userProds.length).toFixed(1)
        : '0.0';

    // ตารางสินค้าของร้านนี้
    const productRows = userProds.map(p => {
        // หายอดขายเป็นชิ้น (เฉพาะที่ขายได้จริงบนแพลตฟอร์ม)
        const soldQty = globalState.orders.reduce((sum, order) => {
            const matches = order.items?.filter(i => String(i.id) === String(p.id)) || [];
            return sum + matches.reduce((s, m) => s + m.qty, 0);
        }, 0);

        const itemSales = globalState.orders.reduce((sum, order) => {
            if (!order.items) return sum;

            // หาสัดส่วนส่วนลดของออเดอร์นี้
            const orderSubtotal = order.items.reduce((s, i) => {
                const prod = globalState.allProducts.find(x => String(x.id) === String(i.id));
                return s + (prod ? prod.price * i.qty : 0);
            }, 0);
            const discountRate = orderSubtotal > 0 ? (order.discount || 0) / orderSubtotal : 0;

            const matches = order.items.filter(i => String(i.id) === String(p.id));
            const subSum = matches.reduce((s, m) => {
                const gross = p.price * m.qty;
                return s + (gross * (1 - discountRate));
            }, 0);

            return sum + subSum;
        }, 0);
        return `
            <tr>
                <td><div style="font-size:18px">${p.emoji || '📦'}</div></td>
                <td><div style="font-size:13px; font-weight:600">${p.name}</div><div style="font-size:10px; color:#999">SKU: ${p.sku || 'N/A'}</div></td>
                <td>฿${p.price.toLocaleString()}</td>
                <td style="font-weight:600">${soldQty}</td>
                <td style="color:#2e7d32; font-weight:700">฿${itemSales.toLocaleString()}</td>
            </tr>
        `;
    }).join('');

    const body = document.getElementById('user-detail-body');
    body.innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px">
            <div style="border:1px solid #eee; padding:15px; border-radius:8px; background:#fafafa">
                <h4 style="margin-bottom:10px; color:var(--admin-primary)">📌 ข้อมูลบัญชี</h4>
                <p><b>ชื่อลูกค้า:</b> ${u.name}</p>
                <p><b>เบอร์โทร:</b> ${u.phone || '-'}</p>
                <p><b>อีเมล:</b> ${u.email || '-'}</p>
                <p><b>สถานะ:</b> ${u.isAdmin ? '<span style="color:red">ADMIN</span>' : (u.isSeller ? '<span style="color:#1976d2">SELLER</span>' : 'BUYER')}</p>
            </div>
            <div style="border:1px solid #eee; padding:15px; border-radius:8px; background:#f1f8e9">
                <h4 style="margin-bottom:10px; color:#4caf50">🛍️ สรุปการซื้อ (Buyer)</h4>
                <p><b>จำนวนออเดอร์:</b> ${userOrders.length} ครั้ง</p>
                <p><b>ยอดช้อปรวม:</b> <strong style="color:#2e7d32">฿${totalSpent.toLocaleString()}</strong></p>
                <p><b>ที่อยู่ล่าสุด:</b> ${userOrders[0]?.address?.split(' | ')[1] || '-'}</p>
            </div>
        </div>
        
        ${u.isSeller ? `
        <div style="margin-top:20px; background:#e3f2fd; padding:18px; border-radius:12px">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px">
                <div>
                    <h4 style="color:#1976d2; margin:0">🏪 วิเคราะห์ร้านค้า: ${u.shopName || u.name + "'s Store"}</h4>
                    <div style="font-size:13px; color:#1976d2; margin-top:4px">⭐ คะแนนร้านค้า: <b>${avgRating}</b> / 5.0</div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:12px; color:#666">รายได้รวมของร้าน</div>
                    <div style="font-size:24px; font-weight:800; color:#2e7d32">฿${totalSales.toLocaleString()}</div>
                </div>
            </div>
            
            <div style="background:#fff; border-radius:8px; overflow:hidden">
                <table class="sd-table" style="font-size:12px">
                    <thead>
                        <tr>
                            <th>รูป</th>
                            <th>สินค้า</th>
                            <th>ราคา</th>
                            <th>ขายแล้ว</th>
                            <th>ยอดขายรวม</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${productRows || '<tr><td colspan="5" style="text-align:center; padding:20px; color:#999">ยังไม่มีสินค้าในร้านนี้</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}

        <div style="margin-top:25px; display:flex; gap:12px; justify-content:flex-end">
             ${!u.isAdmin ? `<button class="btn-adm btn-adm-danger" onclick="banUser(${u.id})">🚫 ระงับการใช้งาน (BAN)</button>` : ''}
             <button class="btn-adm" style="background:#eee; color:#333" onclick="document.getElementById('user-detail-modal').style.display='none'">ปิดหน้าต่าง</button>
        </div>
    `;

    document.getElementById('user-detail-modal').style.display = 'flex';
}

function banUser(id) {
    if (confirm('⚠️ คุณแน่ใจหรือไม่ที่จะระงับการใช้งานสมาชิกรายนี้?\nเขาจะไม่สามารถ Login เข้าสู่ระบบได้อีกต่อไป')) {
        const users = JSON.parse(localStorage.getItem('shopnow_users') || '[]');
        const idx = users.findIndex(u => String(u.id) === String(id));
        if (idx >= 0) {
            users[idx].isBanned = true;
            localStorage.setItem('shopnow_users', JSON.stringify(users));
            loadData();
            goTab('users');
            document.getElementById('user-detail-modal').style.display = 'none';
            alert('✅ ระงับการใช้งานสำเร็จ');
        }
    }
}

async function deleteBanner(id) {
    if (confirm('คุณแน่ใจว่าต้องการลบแบนเนอร์นี้?')) {
        // ☁️ ลบใน Cloud
        await deleteOnlineBanner(id);

        await loadData();
        renderBanners(document.getElementById('admin-content-area'));
        alert('🗑️ ลบแบนเนอร์เรียบร้อย');
    }
}

// ===== VOUCHER CRUD =====

function renderVouchersCRUD(el) {
    el.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
            <div>พบทั้งหมด <b>${globalState.vouchers.length}</b> รหัส</div>
            <button class="btn-adm btn-adm-primary" onclick="showVoucherForm()">+ สร้างคูปองใหม่</button>
        </div>

        <div class="sd-table-wrap" style="background:#fff; border-radius:12px; overflow:hidden">
            <table class="sd-table">
                <thead>
                    <tr>
                        <th>รหัส (Code)</th>
                        <th>รายละเอียด</th>
                        <th>ส่วนลด</th>
                        <th>ขั้นต่ำ</th>
                        <th>จัดการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${globalState.vouchers.map(v => `
                        <tr>
                            <td><b style="font-size:16px; color:var(--admin-primary)">${v.code}</b></td>
                            <td style="font-size:13px">${v.desc}</td>
                            <td style="color:#2e7d32; font-weight:700">฿${v.discount.toLocaleString()}</td>
                            <td>฿${v.minOrder.toLocaleString()}</td>
                            <td>
                                <button class="btn-adm btn-adm-danger" style="padding:6px 12px" onclick="deleteVoucher('${v.code}')">ลบ</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div id="voucher-form-box" style="display:none; margin-top:30px; background:#fff; padding:25px; border-radius:12px; border:2px dashed #ddd">
            <h3 style="margin-bottom:20px">🎟️ ข้อมูลคูปองใหม่</h3>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px">
                <div>
                   <label style="display:block; font-size:12px; margin-bottom:5px">รหัสคูปอง (เช่น SALE50)</label>
                   <input type="text" id="v-code" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px">
                </div>
                <div>
                   <label style="display:block; font-size:12px; margin-bottom:5px">รายละเอียด (เช่น ลด 50 เมื่อซื้อครบ 500)</label>
                   <input type="text" id="v-desc" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px">
                </div>
                <div>
                   <label style="display:block; font-size:12px; margin-bottom:5px">ส่วนลด (บาท)</label>
                   <input type="number" id="v-discount" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px">
                </div>
                <div>
                   <label style="display:block; font-size:12px; margin-bottom:5px">ซื้อขั้นต่ำ (บาท)</label>
                   <input type="number" id="v-min" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px">
                </div>
            </div>
            <div style="margin-top:20px; display:flex; gap:10px">
                <button class="btn-adm btn-adm-primary" onclick="saveVoucher()">บันทึกคูปอง</button>
                <button class="btn-adm" style="background:#eee" onclick="document.getElementById('voucher-form-box').style.display='none'">ยกเลิก</button>
            </div>
        </div>
    `;
}

function showVoucherForm() {
    document.getElementById('voucher-form-box').style.display = 'block';
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

async function saveVoucher() {
    const code = document.getElementById('v-code').value.trim().toUpperCase();
    const desc = document.getElementById('v-desc').value.trim();
    const discount = parseInt(document.getElementById('v-discount').value);
    const minOrder = parseInt(document.getElementById('v-min').value);

    if (!code || !desc || isNaN(discount) || isNaN(minOrder)) {
        alert('❌ กรุณาข้อมูลให้ครบถ้วน');
        return;
    }

    if (globalState.vouchers.find(v => v.code === code)) {
        alert('❌ รหัสคูปองนี้มีอยู่แล้วในระบบ');
        return;
    }

    const newV = { code, desc, discount, minOrder, isFreeShip: false, shop: '' };

    // ☁️ บันทึกลง Cloud
    await saveOnlineVoucher(newV);

    await loadData();
    renderVouchersCRUD(document.getElementById('admin-content-area'));
    alert('✅ เพิ่มคูปองสำเร็จ');
}

async function deleteVoucher(code) {
    if (confirm(`ยืนยันการลบรหัสคูปอง ${code}?`)) {
        // ☁️ ลบใน Cloud
        await deleteOnlineVoucher(code);

        await loadData();
        renderVouchersCRUD(document.getElementById('admin-content-area'));
        alert('🗑️ ลบคูปองเรียบร้อย');
    }
}

async function updateOrderStatus(orderId, newStatus) {
    const order = globalState.orders.find(o => String(o.id) === String(orderId));
    if (order) {
        order.status = newStatus;
        // ☁️ บันทึกลง Cloud
        await saveOnlineOrder(order);

        await loadData();
        renderPlatformOrders(document.getElementById('admin-content-area'));
        alert('✅ อัปเดตสถานะออเดอร์เรียบร้อย');
    }
}

function renderPlatformOrders(el) {
    if (globalState.orders.length === 0) {
        el.innerHTML = `<div style="padding:40px; text-align:center; background:#fff; border-radius:12px"><h3>💸 ยังไม่มีรายการขาย</h3><p>เมื่อมีการสั่งซื้อบนเว็บไซต์ รายการจะมาปรากฏที่นี่</p></div>`;
        return;
    }

    const getStatusBadge = (s) => {
        const map = {
            'pending': { t: 'รอชำระเงิน', c: '#ffa000', bg: '#fff8e1' },
            'shipping': { t: 'กำลังจัดส่ง', c: '#1976d2', bg: '#e3f2fd' },
            'completed': { t: 'สำเร็จแล้ว', c: '#388e3c', bg: '#e8f5e9' },
            'cancelled': { t: 'ยกเลิกแล้ว', c: '#d32f2f', bg: '#ffebee' }
        };
        const st = map[s] || { t: s, c: '#666', bg: '#f5f5f5' };
        return `<span style="background:${st.bg}; color:${st.c}; padding:4px 10px; border-radius:20px; font-size:12px; font-weight:600">${st.t}</span>`;
    };

    el.innerHTML = `
        <div class="sd-table-wrap" style="background:#fff; border-radius:12px; overflow:hidden">
            <table class="sd-table">
                <thead>
                    <tr>
                        <th>เลขที่ออเดอร์</th>
                        <th>วันที่สั่งซื้อ</th>
                        <th>ข้อมูลลูกค้า</th>
                        <th>ยอดรวม</th>
                        <th>สถานะ</th>
                        <th>จัดการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${globalState.orders.map(o => `
                        <tr>
                            <td><b>#${o.id}</b></td>
                            <td>${o.date}</td>
                            <td>
                                <div style="font-size:13px">${o.address?.split(' | ')[0] || 'Unknown'}</div>
                                <div style="font-size:11px; color:#999">${o.address?.split(' | ')[1] || ''}</div>
                            </td>
                            <td style="color:var(--admin-primary); font-weight:700">฿${o.total.toLocaleString()}</td>
                            <td>${getStatusBadge(o.status)}</td>
                            <td>
                                <select onchange="updateOrderStatus('${o.id}', this.value)" style="padding:6px; border-radius:6px; border:1px solid #ddd; font-size:12px">
                                    <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>รอชำระเงิน</option>
                                    <option value="shipping" ${o.status === 'shipping' ? 'selected' : ''}>กำลังจัดส่ง</option>
                                    <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>สำเร็จแล้ว</option>
                                    <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>ยกเลิก</option>
                                </select>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
}

// แบนเนอร์ (ใช้โค้ดที่เคยเขียนไว้มาปรับปรุง)
function renderBanners(el) {
    el.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px">
        <div>มีแบนเนอร์ทั้งหมด <b>${globalState.banners.length}</b> รายการ</div>
        <button class="btn-adm btn-adm-primary" onclick="showBannerForm()">+ เพิ่มแบนเนอร์ใหม่</button>
    </div>

    <div class="sd-table-wrap" style="background:#fff; border-radius:12px; overflow:hidden">
        <table class="sd-table">
            <thead>
                <tr>
                    <th>Visual</th>
                    <th>หัวข้อ / รายละเอียด</th>
                    <th>หมวดหมู่ลิงก์</th>
                    <th>จัดการ</th>
                </tr>
            </thead>
            <tbody>
                ${globalState.banners.map(b => `
                    <tr>
                        <td><div style="font-size:32px">${b.visual}</div></td>
                        <td>
                            <div style="font-weight:700">${b.title}</div>
                            <div style="font-size:12px; color:#666">${b.desc}</div>
                            <div style="font-size:11px; margin-top:4px"><span style="background:#eee; padding:2px 6px; border-radius:4px">${b.badge}</span></div>
                        </td>
                        <td><span class="badge badge-popular">${getCatName(b.cat)}</span></td>
                        <td>
                            <button class="btn-adm btn-adm-danger" style="padding:6px 12px" onclick="deleteBanner(${b.id})">ลบ</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div id="banner-form-box" style="display:none; margin-top:30px; background:#fff; padding:25px; border-radius:12px; border:2px dashed #3f51b5">
        <h3 style="margin-bottom:20px">🖼️ สร้างแบนเนอร์ใหม่</h3>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px">
            <div>
               <label style="display:block; font-size:12px; margin-bottom:5px">หัวข้อเล็ก (เช่น Hot Deal)</label>
               <input type="text" id="bn-badge" placeholder="Hot Deal" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px">
            </div>
            <div>
               <label style="display:block; font-size:12px; margin-bottom:5px">หัวข้อใหญ่ (Title) *</label>
               <input type="text" id="bn-title" placeholder="Summer Sale 50%" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px">
            </div>
            <div style="grid-column: span 2">
               <label style="display:block; font-size:12px; margin-bottom:5px">รายละเอียด (Description)</label>
               <input type="text" id="bn-desc" placeholder="ช้อปกระจาย รับหน้าร้อน..." style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px">
            </div>
            <div>
               <label style="display:block; font-size:12px; margin-bottom:5px">ข้อความบนปุ่ม</label>
               <input type="text" id="bn-btnText" value="ช้อปเลย →" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px">
            </div>
            <div>
               <label style="display:block; font-size:12px; margin-bottom:5px">ลิงก์หมวดหมู่</label>
               <select id="bn-cat" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px">
                    <option value="flash">Flash Sale</option>
                    <option value="electronics">อิเล็กทรอนิกส์</option>
                    <option value="fashion">แฟชั่น</option>
                    <option value="beauty">ความงาม</option>
                    <option value="home">บ้าน</option>
               </select>
            </div>
            <div>
               <label style="display:block; font-size:12px; margin-bottom:5px">Emoji แสดงผล (Visual)</label>
               <input type="text" id="bn-visual" value="🎁" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px">
            </div>
        </div>
        <div style="margin-top:20px; display:flex; gap:10px">
            <button class="btn-adm btn-adm-primary" onclick="saveNewBanner()">✅ บันทึกแบนเนอร์</button>
            <button class="btn-adm" style="background:#eee" onclick="document.getElementById('banner-form-box').style.display='none'">ยกเลิก</button>
        </div>
    </div>
    `;
}

function showBannerForm() {
    document.getElementById('banner-form-box').style.display = 'block';
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

async function saveNewBanner() {
    const title = document.getElementById('bn-title').value.trim();
    if (!title) { alert('❌ กรุณาใส่หัวข้อหลัก'); return; }

    const newB = {
        id: Date.now(),
        badge: document.getElementById('bn-badge').value,
        title: title,
        desc: document.getElementById('bn-desc').value,
        btnText: document.getElementById('bn-btnText').value,
        cat: document.getElementById('bn-cat').value,
        visual: document.getElementById('bn-visual').value
    };

    // ☁️ บันทึกลง Cloud
    await saveOnlineBanner(newB);

    await loadData();
    renderBanners(document.getElementById('admin-content-area'));
    alert('✅ เพิ่มแบนเนอร์สำเร็จ!');
}
// Product & Tag Actions
async function deleteProduct(id) {
    if (!confirm('คุณต้องการลบสินค้านี้ออกจากแพลตฟอร์มหรือไม่?')) return;

    // ☁️ ลบใน Cloud
    await deleteOnlineProduct(id);

    await loadData();
    renderAllProducts(document.getElementById('admin-content-area'));
    alert('🗑️ ลบสินค้าสำเร็จ');
}

async function deleteAllProducts() {
    if (!confirm('⚠️ คำเตือน: คุณแน่ใจว่าต้องการลบสินค้า "ทั้งหมด" ออกจากระบบ? \nการกระทำนี้ไม่สามารถย้อนกลับได้')) return;

    // ☁️ ลบใน Cloud
    const success = await deleteAllOnlineProducts();

    if (success) {
        // ลบข้อมูล local updates ด้วย
        localStorage.removeItem('shopnow_product_updates');
        localStorage.removeItem('shopnow_seller_products');

        await loadData();
        renderAllProducts(document.getElementById('admin-content-area'));
        alert('✅ ลบสินค้าทั้งหมดออกจากระบบเรียบร้อยแล้ว');
    } else {
        alert('❌ เกิดข้อผิดพลาดในการลบข้อมูล');
    }
}

async function toggleTag(id, tag) {
    // ดึงสินค้าจาก globalState
    const prod = globalState.allProducts.find(p => String(p.id) === String(id));
    if (!prod) return;

    if (!prod.tags) prod.tags = [];
    if (prod.tags.includes(tag)) {
        prod.tags = prod.tags.filter(t => t !== tag);
    } else {
        prod.tags.push(tag);
    }

    // ☁️ บันทึกลง Cloud
    await saveOnlineProduct(prod);

    await loadData();
    renderAllProducts(document.getElementById('admin-content-area'));
}
