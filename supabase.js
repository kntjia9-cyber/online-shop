// ===== SUPABASE CONFIGURATION =====
// กรุณานำค่าจาก Supabase Project มาใส่ตรงนี้ครับ
const SUPABASE_URL = 'https://yfhbnbhyybpygllorkbn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmaGJuYmh5eWJweWdsbG9ya2JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDI4NDUsImV4cCI6MjA4NzU3ODg0NX0.e_5sGPFKkp1jKZ7Nt_rHCsH_-y2wFGBD0XJnKdQucDY';

// สร้าง Supabase Client แบบ Lazy (สร้างเมื่อจะใช้) เพื่อป้องกันปัญหา Library โหลดไม่ทัน
let _supabaseCache = null;

function getSupabase() {
    if (_supabaseCache) return _supabaseCache;
    if (window.supabase) {
        _supabaseCache = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('🌐 Supabase Client Initialized');
        return _supabaseCache;
    }
    console.error('❌ Supabase Library not found!');
    return null;
}

/**
 * ฟังก์ชันสำหรับเริ่มใช้งานฐานข้อมูลออนไลน์แทน LocalStorage
 */
async function isOnline() {
    const client = getSupabase();
    return client !== null && SUPABASE_URL.includes('supabase.co') && SUPABASE_KEY !== 'YOUR_SUPABASE_ANON_KEY';
}

/**
 * ฟังก์ชันดึงข้อมูลสินค้าทั้งหมดจาก Cloud
 */
async function fetchOnlineProducts() {
    if (!await isOnline()) return [];
    try {
        const client = getSupabase();
        const { data, error } = await client.from('products').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        // แปลงกลับเป็น CamelCase สำหรับ JS
        return data.map(p => ({
            ...p,
            originalPrice: p.original_price,
            shopBadge: p.shop_badge,
            optionTitle: p.option_title,
            desc: p.description
        }));
    } catch (err) {
        console.error('❌ Fetch Error:', err);
        return [];
    }
}

/**
 * ฟังก์ชันบันทึก/อัปเดตสินค้าขึ้น Cloud
 */
async function saveOnlineProduct(p) {
    if (!await isOnline()) return;
    try {
        const client = getSupabase();
        const dbData = {
            id: p.id,
            sku: p.sku,
            name: p.name,
            price: p.price,
            original_price: p.originalPrice,
            stock: p.stock,
            sold: p.sold,
            category: p.category,
            emoji: p.emoji,
            badge: p.badge,
            tags: p.tags,
            rating: p.rating,
            reviews: p.reviews,
            shop: p.shop,
            shop_badge: p.shopBadge,
            options: p.options,
            option_title: p.optionTitle,
            description: p.desc
        };
        const { error } = await client.from('products').upsert(dbData);
        if (error) {
            console.error('❌ Cloud Save Error:', error.message);
            if (window.showToast) showToast('error', '❌ บันทึก Cloud ไม่สำเร็จ: ' + error.message);
        } else {
            console.log('✅ Cloud Save Success:', p.name);
        }
    } catch (err) {
        console.error('❌ Unexpected Error:', err);
    }
}

/**
 * ฟังก์ชันสมัครสมาชิกผ่าน Cloud
 */
async function signUpOnline(email, password, fullName) {
    const client = getSupabase();
    const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role: 'user' } }
    });
    return { data, error };
}

/**
 * ฟังก์ชันเข้าสู่ระบบออนไลน์
 */
async function signInOnline(email, password) {
    const client = getSupabase();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    return { data, error };
}

/**
 * อัปเดตโปรไฟล์ออนไลน์ (Auth User & Database)
 */
async function updateUserOnline(fullName, metadata = {}) {
    const client = getSupabase();
    const { data, error } = await client.auth.updateUser({
        data: { full_name: fullName, ...metadata }
    });

    if (data?.user) {
        // Sync ลงตาราง users ด้วย
        await saveOnlineUser({
            id: data.user.id,
            email: data.user.email,
            name: fullName,
            ...metadata
        });
    }
    return { data, error };
}

/**
 * บันทึกข้อมูลโปรไฟล์ลงตาราง users
 */
async function saveOnlineUser(user) {
    if (!await isOnline()) return;
    try {
        const client = getSupabase();
        const dbData = {
            id: String(user.id),
            email: user.email,
            name: user.name,
            phone: user.phone || '',
            role: user.role || 'user',
            is_seller: user.isSeller || false,
            shop_name: user.shopName || '',
            is_admin: user.isAdmin || false,
            last_login: new Date().toISOString()
        };
        const { error } = await client.from('users').upsert(dbData, { onConflict: 'id' });
        if (error) console.error('❌ User Sync Error:', error.message);
    } catch (err) {
        console.error('❌ User Sync Error:', err);
    }
}

/**
 * ดึงรายชื่อสมาชิกทั้งหมดจาก Cloud
 */
async function fetchOnlineUsers() {
    if (!await isOnline()) return [];
    try {
        const client = getSupabase();
        const { data, error } = await client.from('users').select('*').order('name', { ascending: true });
        if (error) throw error;
        return data.map(u => ({
            id: u.id,
            email: u.email,
            name: u.name,
            phone: u.phone,
            role: u.role,
            isSeller: u.is_seller,
            shopName: u.shop_name,
            isAdmin: u.is_admin
        }));
    } catch (err) {
        console.error('❌ Fetch Users Error:', err);
        return [];
    }
}

/**
 * ลบสินค้าออกจาก Cloud
 */
async function deleteOnlineProduct(id) {
    if (!await isOnline()) return;
    const client = getSupabase();
    const { error } = await client.from('products').delete().eq('id', id);
    if (error) console.error('❌ Delete Error:', error);
}

/**
 * ลบสินค้าทั้งหมดออกจาก Cloud
 */
async function deleteAllOnlineProducts() {
    if (!await isOnline()) return;
    const client = getSupabase();
    // ใช้ filter ที่ครอบคลุมทั้งตัวเลขและ UUID
    const { error } = await client.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000').neq('id', 0);
    if (error) {
        console.error('❌ Delete Products Error:', error.message);
        return false;
    }
    return true;
}

/**
 * ลบคำสั่งซื้อทั้งหมดออกจาก Cloud
 */
async function deleteAllOnlineOrders() {
    if (!await isOnline()) return;
    const client = getSupabase();
    const { error } = await client.from('orders').delete().neq('id', '0').neq('id', 0);
    if (error) {
        console.error('❌ Delete Orders Error:', error.message);
        return false;
    }
    return true;
}

/**
 * ลบคูปองทั้งหมดออกจาก Cloud
 */
async function deleteAllOnlineVouchers() {
    if (!await isOnline()) return;
    const client = getSupabase();
    const { error } = await client.from('vouchers').delete().not('code', 'is', null);
    if (error) {
        console.error('❌ Delete Vouchers Error:', error.message);
        return false;
    }
    return true;
}

/**
 * ลบแบนเนอร์ทั้งหมดออกจาก Cloud
 */
async function deleteAllOnlineBanners() {
    if (!await isOnline()) return;
    const client = getSupabase();
    const { error } = await client.from('banners').delete().neq('id', 0);
    if (error) {
        console.error('❌ Delete Banners Error:', error.message);
        return false;
    }
    return true;
}

/**
 * ลบสมาชิกทั้งหมดออกจาก Cloud (ยกเว้น Admin)
 */
async function deleteAllOnlineUsers() {
    if (!await isOnline()) return;
    const client = getSupabase();
    // ลบทุกคนยกเว้นแอดมิน
    const { error } = await client.from('users').delete().neq('email', 'houseofstamp@gmail.com');
    if (error) {
        console.error('❌ Delete Users Error:', error.message);
        return false;
    }
    return true;
}

/**
 * รีเซ็ตข้อมูลออนไลน์ทั้งหมด (ลบตามลำดับความสำคัญ)
 */
async function resetAllOnlineData() {
    if (!await isOnline()) return false;

    console.log('🚮 Starting Nuclear Reset...');

    // ต้องลบ Orders ก่อนเสมอ เพราะอาจจะติด Foreign Key ของ Products/Users
    const step1 = await deleteAllOnlineOrders();
    const step2 = await deleteAllOnlineProducts();
    const step3 = await deleteAllOnlineVouchers();
    const step4 = await deleteAllOnlineBanners();
    const step5 = await deleteAllOnlineUsers();

    if (step1 && step2 && step3 && step4 && step5) {
        console.log('✅ All online data cleared successfully');
        return true;
    }
    return false;
}

/**
 * บันทึกคำสั่งซื้อลง Cloud
 */
async function saveOnlineOrder(order) {
    if (!await isOnline()) return;
    try {
        const client = getSupabase();
        const dbData = {
            id: order.id,
            user_id: state.user?.id && typeof state.user.id === 'string' ? state.user.id : null,
            items: order.items,
            total_amount: order.total,
            status: order.status || 'pending',
            shipping_address: order.address,
            payment_method: order.paymentMethod,
            tracking_number: order.trackingNumber || ''
        };
        const { error } = await client.from('orders').upsert(dbData);
        if (error) console.error('❌ Order Save Error:', error.message);
        else console.log('✅ Order Saved Online');
    } catch (err) {
        console.error('❌ Unexpected Order Error:', err);
    }
}

/**
 * ดึงคำสั่งซื้อจาก Cloud
 */
async function fetchOnlineOrders() {
    if (!await isOnline()) return [];
    try {
        const client = getSupabase();
        // ถ้าเป็น Admin ให้ดึงทั้งหมด ถ้าเป็น User ให้ดึงเฉพาะของตัวเอง
        let query = client.from('orders').select('*');

        if (state.user && !state.user.isAdmin) {
            query = query.eq('user_id', state.user.id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        return data.map(o => ({
            id: o.id,
            date: o.created_at,
            items: o.items,
            total: o.total_amount,
            status: o.status,
            address: o.shipping_address,
            paymentMethod: o.payment_method,
            trackingNumber: o.tracking_number
        }));
    } catch (err) {
        console.error('❌ Fetch Orders Error:', err);
        return [];
    }
}

/**
 * ดึงข้อมูลคูปองจาก Cloud
 */
async function fetchOnlineVouchers() {
    if (!await isOnline()) return [];
    try {
        const client = getSupabase();
        const { data, error } = await client.from('vouchers').select('*');
        if (error) throw error;
        return data.map(v => ({
            code: v.code,
            discount: v.discount,
            minOrder: v.min_order,
            desc: v.description,
            shop: v.shop_name,
            isFreeShip: v.is_free_ship
        }));
    } catch (err) {
        console.error('❌ Fetch Vouchers Error:', err);
        return [];
    }
}

/**
 * บันทึกคูปองลง Cloud
 */
async function saveOnlineVoucher(v) {
    if (!await isOnline()) return;
    try {
        const client = getSupabase();
        const dbData = {
            code: v.code,
            discount: v.discount,
            min_order: v.minOrder,
            description: v.desc,
            shop_name: v.shop,
            is_free_ship: v.isFreeShip || false
        };
        const { error } = await client.from('vouchers').upsert(dbData, { onConflict: 'code' });
        if (error) console.error('❌ Save Voucher Error:', error.message);
    } catch (err) {
        console.error('❌ Save Voucher Error:', err);
    }
}

/**
 * ลบคูปองออกจาก Cloud
 */
async function deleteOnlineVoucher(code) {
    if (!await isOnline()) return;
    try {
        const client = getSupabase();
        const { error } = await client.from('vouchers').delete().eq('code', code);
        if (error) console.error('❌ Delete Voucher Error:', error.message);
    } catch (err) {
        console.error('❌ Delete Voucher Error:', err);
    }
}

/**
 * ดึงข้อมูลแบนเนอร์จาก Cloud
 */
async function fetchOnlineBanners() {
    if (!await isOnline()) return [];
    try {
        const client = getSupabase();
        const { data, error } = await client.from('banners').select('*').order('id', { ascending: true });
        if (error) throw error;
        return data.map(b => ({
            id: b.id,
            badge: b.badge,
            title: b.title,
            desc: b.description,
            btnText: b.btn_text,
            cat: b.category_link,
            visual: b.visual_emoji
        }));
    } catch (err) {
        console.error('❌ Fetch Banners Error:', err);
        return [];
    }
}

/**
 * บันทึกแบนเนอร์ลง Cloud
 */
async function saveOnlineBanner(b) {
    if (!await isOnline()) return;
    try {
        const client = getSupabase();
        const dbData = {
            id: b.id,
            badge: b.badge,
            title: b.title,
            description: b.desc,
            btn_text: b.btnText,
            category_link: b.cat,
            visual_emoji: b.visual
        };
        const { error } = await client.from('banners').upsert(dbData);
        if (error) console.error('❌ Save Banner Error:', error.message);
    } catch (err) {
        console.error('❌ Save Banner Error:', err);
    }
}

/**
 * ลบแบนเนอร์ออกจาก Cloud
 */
async function deleteOnlineBanner(id) {
    if (!await isOnline()) return;
    try {
        const client = getSupabase();
        const { error } = await client.from('banners').delete().eq('id', id);
        if (error) console.error('❌ Delete Banner Error:', error.message);
    } catch (err) {
        console.error('❌ Delete Banner Error:', err);
    }
}

/**
 * ย้ายข้อมูลจากเครื่องขึ้น Cloud (Migration)
 */
async function migrateToCloud() {
    if (!await isOnline()) return;

    // ตรวจสอบว่าเคยย้ายหรือยัง (ใช้ flag ใน localStorage)
    if (localStorage.getItem('shopnow_migrated_v3')) return;

    // ถ้ามีการสั่ง Reset ล้างเครื่องไปแล้ว ไม่ต้อง Migrate ข้อมูลเก่าขึ้นมาอีก
    if (localStorage.getItem('shopnow_force_clean')) return;

    console.log('📦 เริ่มการตรวจสอบการย้ายข้อมูลไป Cloud...');

    // 1. ดึงสินค้าเดิมในเครื่อง
    const localProducts = JSON.parse(localStorage.getItem('shopnow_seller_products') || '[]');
    if (localProducts.length > 0) {
        console.log('📦 กำลังย้ายสินค้า', localProducts.length, 'รายการ...');
        for (const p of localProducts) {
            await saveOnlineProduct(p);
        }
    }

    // 2. ย้ายคูปอง
    const localVouchers = JSON.parse(localStorage.getItem('shopnow_vouchers') || '[]');
    if (localVouchers.length > 0) {
        console.log('📦 กำลังย้ายคูปอง', localVouchers.length, 'รายการ...');
        for (const v of localVouchers) {
            await saveOnlineVoucher(v);
        }
    }

    // 3. ย้ายออเดอร์
    const savedState = JSON.parse(localStorage.getItem('shopnow_state') || '{}');
    const localOrders = savedState.orders || [];
    if (localOrders.length > 0) {
        console.log('📦 กำลังย้ายคำสั่งซื้อ', localOrders.length, 'รายการ...');
        for (const o of localOrders) {
            await saveOnlineOrder(o);
        }
    }

    // 4. ย้ายแบนเนอร์ (ถ้ามีการแก้ไขจาก Default)
    const localBanners = savedState.banners || [];
    if (localBanners.length > 0) {
        console.log('📦 กำลังย้ายแบนเนอร์', localBanners.length, 'รายการ...');
        for (const b of localBanners) {
            await saveOnlineBanner(b);
        }
    }

    // 5. ย้ายบัญชีสมาชิก (ถ้ามี)
    const localUsers = JSON.parse(localStorage.getItem('shopnow_users') || '[]');
    if (localUsers.length > 0) {
        console.log('📦 กำลังย้ายข้อมูลสมาชิก', localUsers.length, 'รายชื่อ...');
        for (const u of localUsers) {
            await saveOnlineUser(u);
        }
    }

    localStorage.setItem('shopnow_migrated_v3', 'true');
    console.log('✅ ตรวจสอบและย้ายข้อมูลเสร็จสมบูรณ์!');
}
