import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, updateDoc, increment, where, getDoc, setDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB3bQkI8scEHg36kkxlAalbbCtE4R0Vv8U",
  authDomain: "hanitech-pharmacy-tracker.firebaseapp.com",
  projectId: "hanitech-pharmacy-tracker",
  storageBucket: "hanitech-pharmacy-tracker.firebasestorage.app",
  messagingSenderId: "692991067588",
  appId: "1:692991067588:web:5f0cab885c4aaa64785091"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let allMedicines = []; 
let allCategories = [];
let allExpCategories = [];
let allBranches = [];
let allCustomers = [];
let allSales = [];
let allExpenses = [];
let allFixed = [];
let allCreditPayments = [];
let cart = []; 
let currentUserPharmacyId = null;
let currentBizType = 'retail';
let lowStockThreshold = 10;
let dailyChartInstance = null, expensePieChartInstance = null;

window.toggleSection = function(h, b) { 
  const hd = document.getElementById(h); 
  const bd = document.getElementById(b); 
  if (!hd || !bd) return; 
  const o = bd.classList.toggle('open'); 
  hd.classList.toggle('open', o); 
};

window.onMedTypeChange = function() {
  const type = document.getElementById('medType').value;
  const medFields = document.getElementById('medicineOnlyFields');
  medFields.style.display = type === 'cosmetic' ? 'none' : 'block';
};

// ==========================================
// 🔐 LOGIN & HEADER LOADING (የተሻሻለ)
// ==========================================

async function loadUserHeader(user) {
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      console.warn('User doc not found');
      return;
    }
    const userData = userDoc.data();
    currentUserPharmacyId = userData.pharmacyId;

    // Email & Initial
    const userEmail = userData.email || user.email || '';
    document.getElementById('hdrUserEmail').innerText = userEmail;
    document.getElementById('hdrUserInitial').innerText = userEmail.charAt(0).toUpperCase() || 'U';

    // Role
    const role = (userData.role || 'employee').toString().toLowerCase().trim();
    const roleElement = document.getElementById('hdrUserRole');
    
    if (role === 'owner' || role === 'ባለቤት') {
      roleElement.innerText = '👑 ባለቤት';
      roleElement.style.background = '#fefcbf';
      roleElement.style.color = '#975a16';
    } else if (role === 'manager' || role === 'ማናጀር') {
      roleElement.innerText = '🎯 ማናጀር';
      roleElement.style.background = '#bee3f8';
      roleElement.style.color = '#2c5282';
    } else if (role === 'accountant' || role === 'አካውንታንት') {
      roleElement.innerText = '💼 አካውንታንት';
      roleElement.style.background = '#c6f6d5';
      roleElement.style.color = '#22543d';
    } else {
      roleElement.innerText = '👤 ሠራተኛ';
      roleElement.style.background = '#e2e8f0';
      roleElement.style.color = '#4a5568';
    }

    // Pharmacy name
    if (currentUserPharmacyId) {
      const phDoc = await getDoc(doc(db, 'pharmacies', currentUserPharmacyId));
      if (phDoc.exists()) {
        const phData = phDoc.data();
        document.getElementById('hdrPharmacyName').innerText = '💊 ' + (phData.name || 'Pharmacy Tracker');
        currentBizType = phData.bizType || 'retail';
        lowStockThreshold = phData.lowStockThreshold || 10;
      } else {
        document.getElementById('hdrPharmacyName').innerText = '💊 Pharmacy Tracker';
      }
    } else {
      document.getElementById('hdrPharmacyName').innerText = '💊 Pharmacy Tracker';
    }
  } catch (err) {
    console.error('loadUserHeader error:', err);
  }
}

window.login = async function() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('loginError');
  errorEl.style.display = 'none';

  try {
    await signInWithEmailAndPassword(auth, email, password);
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.add('show');
  } catch (err) {
    errorEl.textContent = '⚠️ ስህተት: Email ወይም Password ትክክል አይደለም';
    errorEl.style.display = 'block';
  }
};

window.logout = function() { signOut(auth); };

onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.add('show');
    
    // 1. መጀመሪያ ስም፣ ሚና እና ኢሜይል ይጫን
    await loadUserHeader(user);
    
    // 2. ከዚያ ዳታ ይጫን
    await loadAllData();
  } else {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.remove('show');
    currentUserPharmacyId = null;
  }
});

// ==========================================
// 📦 DATA LOADING (የፋርማሲውን ዳታ ብቻ የሚያመጣ)
// ==========================================

async function loadAllData() {
  if (!currentUserPharmacyId) return;
  
  await loadCategories();
  await loadExpCategories();
  await loadBranches();
  await loadCustomers();
  await loadMedicines();
  await loadSales();
  await loadExpenses();
  await loadFixed();
  await loadCreditPayments();
  loadInventory();
  renderSellProducts();
  renderCart();
  loadDailyReport();
  loadMonthlyReport();
  loadDashboard();
  loadSettings();
  checkExpiryAlerts();
  loadDarkMode();
  applyBizTypeUI();
}

function applyBizTypeUI() {
  const creditOpt = document.getElementById('creditOption');
  const tabCreditLabel = document.getElementById('tabCreditLabel');
  const wholesaleFields = document.getElementById('wholesaleSaleFields');
  const retailFields = document.getElementById('retailSaleFields');

  if (currentBizType === 'wholesale') {
    if (creditOpt) creditOpt.style.display = 'block';
    if (tabCreditLabel) tabCreditLabel.style.display = 'flex';
    if (wholesaleFields) wholesaleFields.style.display = 'block';
    if (retailFields) retailFields.style.display = 'none';
  } else {
    if (creditOpt) creditOpt.style.display = 'none';
    if (tabCreditLabel) tabCreditLabel.style.display = 'none';
    if (wholesaleFields) wholesaleFields.style.display = 'none';
    if (retailFields) retailFields.style.display = 'block';
    const pm = document.getElementById('sellPaymentMethod');
    if (pm && pm.value === 'credit') { pm.value = 'cash'; togglePaymentDetails(); }
  }
}

window.togglePaymentDetails = function() {
  const method = document.getElementById('sellPaymentMethod').value;
  const details = document.getElementById('creditPaymentDetails');
  if (!details) return;
  details.style.display = method === 'credit' ? 'block' : 'none';
};

// ---- Categories ----
async function loadCategories() {
  try {
    const q = query(collection(db, 'categories'), where('pharmacyId', '==', currentUserPharmacyId));
    const snap = await getDocs(q);
    allCategories = [];
    const select = document.getElementById('medCategory');
    select.innerHTML = '<option value="">-- ምድብ ምረጥ --</option>';
    snap.forEach(doc => {
      const catName = doc.data().name;
      allCategories.push(catName);
      select.innerHTML += `<option value="${catName}">${catName}</option>`;
    });
    renderCategoryList();
  } catch(e) { console.error(e); }
}

function renderCategoryList() {
  const listEl = document.getElementById('catListDisplay');
  if(allCategories.length === 0) { listEl.innerHTML = '<p style="font-size:13px; color:#a0aec0;">ምንም ምድብ የለም።</p>'; return; }
  let html = '';
  allCategories.forEach(c => { html += `<span class="cat-tag">${c} <span class="del" onclick="deleteCategory('${c}')">×</span></span>`; });
  listEl.innerHTML = html;
}

window.addCategory = async function() {
  const name = document.getElementById('newCat').value.trim();
  if(!name) { alert('ስም አስገባ'); return; }
  try {
    await setDoc(doc(db, 'categories', currentUserPharmacyId + '_' + name), { 
      name: name,
      pharmacyId: currentUserPharmacyId
    });
    document.getElementById('newCat').value = '';
    loadCategories();
    alert('✅ ምድብ ተጨምሯል!');
  } catch(e) { alert(e.message); }
};

window.deleteCategory = async function(name) {
  if(!confirm('ይህን ምድብ ማጥፋት ትፈልጋለህ?')) return;
  try { await deleteDoc(doc(db, 'categories', currentUserPharmacyId + '_' + name)); loadCategories(); } catch(e) { alert(e.message); }
};

// ---- Expense Categories ----
async function loadExpCategories() {
  try {
    const q = query(collection(db, 'expenseCategories'), where('pharmacyId', '==', currentUserPharmacyId));
    const snap = await getDocs(q);
    allExpCategories = [];
    const select = document.getElementById('expCat');
    select.innerHTML = '<option value="">-- ምድብ ምረጥ --</option>';
    snap.forEach(doc => {
      const catName = doc.data().name;
      allExpCategories.push(catName);
      select.innerHTML += `<option value="${catName}">${catName}</option>`;
    });
    renderExpCatList();
  } catch(e) { console.error(e); }
}

function renderExpCatList() {
  const listEl = document.getElementById('expCatListDisplay');
  if(allExpCategories.length === 0) { listEl.innerHTML = '<p style="font-size:13px; color:#a0aec0;">ምንም ምድብ የለም።</p>'; return; }
  let html = '';
  allExpCategories.forEach(c => { html += `<span class="cat-tag">${c} <span class="del" onclick="deleteExpCategory('${c}')">×</span></span>`; });
  listEl.innerHTML = html;
}

window.addExpCategory = async function() {
  const name = document.getElementById('newExpCat').value.trim();
  if(!name) { alert('ስም አስገባ'); return; }
  try {
    await setDoc(doc(db, 'expenseCategories', currentUserPharmacyId + '_' + name), { 
      name: name,
      pharmacyId: currentUserPharmacyId
    });
    document.getElementById('newExpCat').value = '';
    loadExpCategories();
    alert('✅ ምድብ ተጨምሯል!');
  } catch(e) { alert(e.message); }
};

window.deleteExpCategory = async function(name) {
  if(!confirm('ይህን ምድብ ማጥፋት ትፈልጋለህ?')) return;
  try { await deleteDoc(doc(db, 'expenseCategories', currentUserPharmacyId + '_' + name)); loadExpCategories(); } catch(e) { alert(e.message); }
};

// ---- Branches ----
async function loadBranches() {
  try {
    const q = query(collection(db, 'branches'), where('pharmacyId', '==', currentUserPharmacyId));
    const snap = await getDocs(q);
    allBranches = [];
    const selects = ['sellBranch', 'expBranch', 'quickBranch', 'dailyReportBranch', 'monthlyReportBranch'];
    selects.forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.innerHTML = '<option value="all">ሁሉም</option>';
    });
    snap.forEach(doc => {
      const bName = doc.data().name;
      allBranches.push(bName);
      selects.forEach(id => {
        const sel = document.getElementById(id);
        if (sel) sel.innerHTML += `<option value="${bName}">${bName}</option>`;
      });
    });
    renderBranchList();
  } catch(e) { console.error(e); }
}

function renderBranchList() {
  const listEl = document.getElementById('branchListDisplay');
  if(allBranches.length === 0) { listEl.innerHTML = '<p style="font-size:13px; color:#a0aec0;">ምንም ቅርንጫፍ የለም።</p>'; return; }
  let html = '';
  allBranches.forEach(c => { html += `<span class="cat-tag">${c} <span class="del" onclick="deleteBranch('${c}')">×</span></span>`; });
  listEl.innerHTML = html;
}

window.addBranch = async function() {
  const name = document.getElementById('newBranch').value.trim();
  if(!name) { alert('ስም አስገባ'); return; }
  try {
    await setDoc(doc(db, 'branches', currentUserPharmacyId + '_' + name), { 
      name: name,
      pharmacyId: currentUserPharmacyId
    });
    document.getElementById('newBranch').value = '';
    loadBranches();
    alert('✅ ቅርንጫፍ ተጨምሯል!');
  } catch(e) { alert(e.message); }
};

window.deleteBranch = async function(name) {
  if(!confirm('ይህን ቅርንጫፍ ማጥፋት ትፈልጋለህ?')) return;
  try { await deleteDoc(doc(db, 'branches', currentUserPharmacyId + '_' + name)); loadBranches(); } catch(e) { alert(e.message); }
};

// ---- Customers ----
async function loadCustomers() {
  try {
    const q = query(collection(db, 'customers'), where('pharmacyId', '==', currentUserPharmacyId));
    const snap = await getDocs(q);
    allCustomers = [];
    const sel = document.getElementById('sellCustomer');
    if (sel) sel.innerHTML = '<option value="">-- ደንበኛ ምረጥ --</option>';
    snap.forEach(doc => {
      const cName = doc.data().name;
      allCustomers.push(cName);
      if (sel) sel.innerHTML += `<option value="${cName}">${cName}</option>`;
    });
    renderCustomerList();
    populateCreditCustomerSelect();
  } catch(e) { console.error(e); }
}

function renderCustomerList() {
  const listEl = document.getElementById('customerListDisplay');
  if(!listEl) return;
  if(allCustomers.length === 0) { listEl.innerHTML = '<p style="font-size:13px; color:#a0aec0;">ምንም ደንበኛ የለም።</p>'; return; }
  let html = '';
  allCustomers.forEach(c => { html += `<span class="cat-tag">${c} <span class="del" onclick="deleteCustomer('${c}')">×</span></span>`; });
  listEl.innerHTML = html;
}

window.addCustomer = async function() {
  const name = document.getElementById('newCustomer').value.trim();
  if(!name) { alert('ስም አስገባ'); return; }
  try {
    await setDoc(doc(db, 'customers', currentUserPharmacyId + '_' + name), { 
      name: name,
      pharmacyId: currentUserPharmacyId
    });
    document.getElementById('newCustomer').value = '';
    loadCustomers();
    alert('✅ ደንበኛ ተጨምሯል!');
  } catch(e) { alert(e.message); }
};

window.deleteCustomer = async function(name) {
  if(!confirm('ይህን ደንበኛ ማጥፋት ትፈልጋለህ?')) return;
  try { await deleteDoc(doc(db, 'customers', currentUserPharmacyId + '_' + name)); loadCustomers(); } catch(e) { alert(e.message); }
};

// ---- Medicines ----
window.addMedicine = async function() {
  const type = document.getElementById('medType').value;
  const category = document.getElementById('medCategory').value;
  const subcategory = document.getElementById('medSubcategory').value.trim();
  const name = document.getElementById('medName').value.trim();
  const cost = parseFloat(document.getElementById('medCost').value);
  const price = parseFloat(document.getElementById('medPrice').value);
  const qty = parseInt(document.getElementById('medQty').value);

  const batch = document.getElementById('medBatch').value.trim();
  const expiry = document.getElementById('medExpiry').value;
  const supplier = document.getElementById('medSupplier').value.trim();

  if (!batch || !expiry) { alert('⚠️ እባክህ የባች ቁጥር እና የማለቂያ ቀን ሙላ!'); return; }
  if (!category || !subcategory || !name || isNaN(cost) || isNaN(price) || isNaN(qty) || qty <= 0) {
    alert('⚠️ እባክህ ሁሉንም መረጃዎች በትክክል ሙላ!');
    return;
  }

  try {
    await addDoc(collection(db, 'medicines'), {
      type, category, subcategory, name, batch, expiry, supplier, cost, price, quantity: qty, createdAt: serverTimestamp(), pharmacyId: currentUserPharmacyId
    });
    alert('✅ ምርቱ ተመዝግቧል!');
    document.getElementById('medSubcategory').value = '';
    document.getElementById('medName').value = '';
    document.getElementById('medBatch').value = '';
    document.getElementById('medExpiry').value = '';
    document.getElementById('medSupplier').value = '';
    document.getElementById('medCost').value = '';
    document.getElementById('medPrice').value = '';
    document.getElementById('medQty').value = '';
    loadAllData();
  } catch (err) { alert('⚠️ ስህተት: ' + err.message); }
};

async function loadMedicines() {
  try {
    const q = query(
      collection(db, 'medicines'), 
      where('pharmacyId', '==', currentUserPharmacyId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    allMedicines = [];
    snapshot.forEach(doc => allMedicines.push({ id: doc.id, ...doc.data() }));
    renderMedList();
  } catch (err) { 
    console.error("Error loading medicines:", err); 
  }
}

window.renderMedList = function() {
  const listEl = document.getElementById('medListDisplay');
  const filter = document.getElementById('filterTypeMed').value;
  let filtered = allMedicines;
  if (filter !== 'all') filtered = allMedicines.filter(m => m.type === filter);
  
  if(filtered.length === 0) { listEl.innerHTML = '<p style="text-align:center; color:#a0aec0; font-size:13px;">ምንም ምርት የለም።</p>'; return; }
  let html = '';
  filtered.forEach(m => {
    const typeLabel = m.type === 'cosmetic' ? '🧴 ኮስሞቲክስ' : '💊 መድሃኒት';
    const extra = ` | 📦 ${m.batch || '-'} | 📅 ${m.expiry || '-'}`;
    html += `<div class="list-item"><div class="info"><div class="name">${m.name}</div><div class="meta">${typeLabel} | 📁 ${m.category} → ${m.subcategory}${extra}</div></div><div class="amount">${m.price} ብር</div></div>`;
  });
  listEl.innerHTML = html;
};

// ---- Sales & POS ----
function renderSellProducts() {
  const search = (document.getElementById('searchSellInput')?.value || '').toLowerCase();
  const listEl = document.getElementById('sellProductList');
  if(!listEl) return;

  let filtered = allMedicines.filter(m => m.quantity > 0);
  if (search) filtered = filtered.filter(m => m.name.toLowerCase().includes(search));

  if (filtered.length === 0) {
    listEl.innerHTML = '<p style="text-align:center; color:#a0aec0; font-size:13px;">ምንም ምርት አልተገኘም።</p>';
    return;
  }

  const grouped = {};
  filtered.forEach(m => {
    const key = (m.type === 'cosmetic' ? '🧴 ' : '💊 ') + m.category;
    if(!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  });

  let html = '';
  Object.keys(grouped).forEach(catName => {
    html += `<div class="cat-section"><div class="cat-header open" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')"><div class="cat-left"><span class="cat-arrow">▶</span><span class="cat-name">📁 ${catName}</span></div></div><div class="cat-body open">`;
    grouped[catName].forEach(m => {
      html += `<div class="list-item"><div class="info"><div class="name">${m.name}</div><div class="meta">${m.subcategory} | ቀሪ: ${m.quantity} | ${m.price} ብር</div></div><input class="qty-input" type="number" min="0" placeholder="0" onchange="addToCart('${m.id}', this.value)" onclick="event.stopPropagation()"></div>`;
    });
    html += `</div></div>`;
  });
  listEl.innerHTML = html;
}

window.addToCart = function(id, qty) {
  qty = parseInt(qty);
  if(isNaN(qty) || qty <= 0) return;
  const med = allMedicines.find(m => m.id === id);
  if(!med || med.quantity < qty) { alert(`በቂ ክምችት የለም! ያለው: ${med.quantity}`); return; }
  
  const existing = cart.find(c => c.id === id);
  if(existing) existing.qty += qty;
  else cart.push({ id, name: med.name, price: med.price, qty });
  
  renderCart();
  document.getElementById('searchSellInput').value = '';
  renderSellProducts();
};

function renderCart() {
  const listEl = document.getElementById('cartList');
  if(cart.length === 0) { listEl.innerHTML = '<p style="text-align:center; color:#a0aec0; font-size:13px;">ምንም የተመረጠ የለም።</p>'; document.getElementById('cartTotal').innerText = '0.00 ብር'; return; }
  
  let html = '';
  let total = 0;
  cart.forEach((c, i) => {
    total += c.price * c.qty;
    html += `<div class="list-item"><div class="info"><div class="name">${c.name}</div><div class="meta">${c.qty} x ${c.price} ብር</div></div><div style="display:flex; align-items:center;"><div class="amount">${(c.price * c.qty).toFixed(2)} ብር</div><button onclick="removeFromCart(${i})" style="margin-left:8px; background:#c53030; color:white; border:none; border-radius:6px; padding:4px 8px; cursor:pointer; font-size:12px;">✕</button></div></div>`;
  });
  listEl.innerHTML = html;
  document.getElementById('cartTotal').innerText = total.toFixed(2) + ' ብር';
}

window.removeFromCart = function(i) { cart.splice(i, 1); renderCart(); };
window.clearCart = function() { cart = []; renderCart(); };

window.completeSale = async function() {
  if(cart.length === 0) { alert('ምንም የተመረጠ የለም'); return; }
  const date = document.getElementById('sellDate').value;
  const receipt = document.getElementById('sellReceipt').value.trim();
  const paymentMethod = document.getElementById('sellPaymentMethod').value;
  if(!date) { alert('ቀን ምረጥ'); return; }

  let branch = 'all', customer = '';
  if (currentBizType === 'wholesale') {
    customer = document.getElementById('sellCustomer').value;
    if (!customer) { alert('⚠️ እባክህ ደንበኛ ምረጥ!'); return; }
  } else {
    branch = document.getElementById('sellBranch').value;
  }

  let totalAmount = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  let paidAmount = totalAmount;
  if (paymentMethod === 'credit') {
    paidAmount = parseFloat(document.getElementById('sellPaidAmount').value) || 0;
    if (paidAmount > totalAmount) paidAmount = totalAmount;
  }

  try {
    for(const item of cart) {
      await addDoc(collection(db, 'sales'), { 
        medicineId: item.id, medicineName: item.name, quantity: item.qty, unitPrice: item.price, 
        total: item.price * item.qty, 
        paymentMethod: paymentMethod,
        paidAmount: paymentMethod === 'credit' ? (item.price * item.qty) * (paidAmount/totalAmount) : (item.price * item.qty),
        date, branch, customer, receipt, timestamp: serverTimestamp(), pharmacyId: currentUserPharmacyId 
      });
      await updateDoc(doc(db, 'medicines', item.id), { quantity: increment(-item.qty) });
    }
    alert('✅ ሽያጭ ተመዝግቧል!');
    cart = []; renderCart();
    document.getElementById('sellPaidAmount').value = '0';
    loadAllData();
  } catch(e) { alert(e.message); }
};

window.addQuickSale = async function() {
  const type = document.getElementById('quickType').value;
  const cat = document.getElementById('quickCat').value;
  const branch = document.getElementById('quickBranch').value;
  const date = document.getElementById('quickDate').value;
  const amount = parseFloat(document.getElementById('quickAmount').value);
  if(!cat || !date || isNaN(amount) || amount <= 0) { alert('ሁሉንም መረጃዎች ሙላ'); return; }

  try {
    await addDoc(collection(db, 'quickSales'), { type, category: cat, branch, date, amount, paymentMethod: 'cash', timestamp: serverTimestamp(), pharmacyId: currentUserPharmacyId });
    alert('✅ ተመዝግቧል!');
    document.getElementById('quickAmount').value = '';
    loadAllData();
  } catch(e) { alert(e.message); }
};

// ---- Expenses ----
window.addExpense = async function() {
  const cat = document.getElementById('expCat').value;
  const branch = document.getElementById('expBranch').value;
  const note = document.getElementById('expNote').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  const date = document.getElementById('expDate').value;
  if(!cat || isNaN(amount) || amount <= 0 || !date) { alert('ሁሉንም መረጃዎች ሙላ'); return; }
  try {
    await addDoc(collection(db, 'expenses'), { category: cat, branch, note, amount, date, timestamp: serverTimestamp(), pharmacyId: currentUserPharmacyId });
    alert('✅ ተመዝግቧል!');
    document.getElementById('expNote').value = '';
    document.getElementById('expAmount').value = '';
    loadAllData();
  } catch(e) { alert(e.message); }
};

window.addFixedExpense = async function() {
  const cat = document.getElementById('fixCat').value;
  const note = document.getElementById('fixNote').value.trim();
  const amount = parseFloat(document.getElementById('fixAmount').value);
  const month = document.getElementById('fixMonth').value;
  if(!cat || isNaN(amount) || amount <= 0 || !month) { alert('ሁሉንም መረጃዎች ሙላ'); return; }
  try {
    await addDoc(collection(db, 'fixedExpenses'), { category: cat, note, amount, month, timestamp: serverTimestamp(), pharmacyId: currentUserPharmacyId });
    alert('✅ ተመዝግቧል!');
    document.getElementById('fixNote').value = '';
    document.getElementById('fixAmount').value = '';
    loadAllData();
  } catch(e) { alert(e.message); }
};

async function loadSales() {
  try {
    const q = query(collection(db, 'sales'), where('pharmacyId', '==', currentUserPharmacyId));
    const snap = await getDocs(q);
    allSales = []; snap.forEach(d => allSales.push({ id: d.id, ...d.data() }));
  } catch(e) { console.error(e); }
}

async function loadExpenses() {
  try {
    const q = query(collection(db, 'expenses'), where('pharmacyId', '==', currentUserPharmacyId));
    const snap = await getDocs(q);
    allExpenses = []; snap.forEach(d => allExpenses.push({ id: d.id, ...d.data() }));
  } catch(e) { console.error(e); }
}

async function loadFixed() {
  try {
    const q = query(collection(db, 'fixedExpenses'), where('pharmacyId', '==', currentUserPharmacyId));
    const snap = await getDocs(q);
    allFixed = []; snap.forEach(d => allFixed.push({ id: d.id, ...d.data() }));
  } catch(e) { console.error(e); }
}

async function loadCreditPayments() {
  try {
    const q = query(collection(db, 'creditPayments'), where('pharmacyId', '==', currentUserPharmacyId));
    const snap = await getDocs(q);
    allCreditPayments = []; snap.forEach(d => allCreditPayments.push({ id: d.id, ...d.data() }));
  } catch(e) { console.error(e); }
}

// ---- Inventory & Stock ----
function loadInventory() {
  const listEl = document.getElementById('inventoryList');
  const filter = document.getElementById('filterTypeInv').value;
  let filtered = allMedicines;
  if (filter === 'medicine') filtered = allMedicines.filter(m => m.type === 'medicine');
  else if (filter === 'cosmetic') filtered = allMedicines.filter(m => m.type === 'cosmetic');

  if (filtered.length === 0) { listEl.innerHTML = '<p style="text-align:center; color:#a0aec0; font-size:13px;">ምንም ምርት የለም።</p>'; document.getElementById('invTotalValue').innerHTML = '0.00 <small>ብር</small>'; return; }
  
  const grouped = {};
  filtered.forEach(med => {
    const typeKey = med.type === 'cosmetic' ? '🧴 ኮስሞቲክስ' : '💊 መድሃኒት';
    const cat = med.category || 'ሌላ'; const sub = med.subcategory || 'ሌላ';
    const key = typeKey + ' - ' + cat;
    if(!grouped[key]) grouped[key] = {};
    if(!grouped[key][sub]) grouped[key][sub] = [];
    grouped[key][sub].push(med);
  });

  let html = '';
  let grandTotal = 0;
  Object.keys(grouped).forEach(catName => {
    let catTotalQty = 0, catTotalValue = 0;
    html += `<div class="cat-section"><div class="cat-header open" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')"><div class="cat-left"><span class="cat-arrow">▶</span><span class="cat-name">📁 ${catName}</span></div></div><div class="cat-body open">`;
    Object.keys(grouped[catName]).forEach(subName => {
      html += `<div style="font-size:13px; font-weight:bold; color:#4a5568; margin:8px 0 5px 5px;">↳ ${subName}</div>`;
      grouped[catName][subName].forEach(med => {
        catTotalQty += med.quantity;
        catTotalValue += med.quantity * (med.price || 0);
        const today = new Date(); today.setHours(0,0,0,0);
        let alertHtml = ''; let rowStyle = '';
        if (med.expiry) {
          const expiryDate = new Date(med.expiry);
          const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) { alertHtml = `<span class="expiry-alert">🚨 ጊዜው አልፏል!</span>`; rowStyle = 'background:#fff5f5; border:1px solid #fed7d7;'; }
          else if (diffDays <= 30) { alertHtml = `<span class="expiry-alert" style="color:#dd6b20;">⚠️ ${diffDays} ቀን ቀርቷል</span>`; rowStyle = 'background:#fffaf0; border:1px solid #fbd38d;'; }
        }
        if (med.quantity <= lowStockThreshold && !alertHtml) { alertHtml = '<span class="low-stock">⚠️ ክምችት እያለቀ ነው</span>'; }
        
        const extra = `<br>📦 ${med.batch || '-'} | 📅 ${med.expiry || '-'}`;
        html += `<div class="list-item" style="${rowStyle}"><div class="info"><div class="name">${med.name}</div><div class="meta">${extra} ${alertHtml}</div></div><div class="amount">${med.quantity} <small style="font-size:10px;color:#718096;">ብዛት</small><br><small style="font-size:11px;color:#276749;">${med.price} ብር</small></div></div>`;
      });
    });
    grandTotal += catTotalValue;
    html += `<div style="padding:8px; background:#ebf4ff; border-radius:6px; margin-top:8px; font-size:12.5px; font-weight:700; color:#2c5282;">📊 የዚህ ምድብ ድምር: ${catTotalQty} ብዛት | ${catTotalValue.toFixed(2)} ብር</div>`;
    html += `</div></div>`;
  });
  listEl.innerHTML = html;
  document.getElementById('invTotalValue').innerHTML = grandTotal.toFixed(2) + ' <small>ብር</small>';

  const adjSel = document.getElementById('adjustMedId');
  adjSel.innerHTML = '<option value="">-- ምርት ምረጥ --</option>';
  allMedicines.forEach(m => { adjSel.innerHTML += `<option value="${m.id}">${m.name} (ቀሪ: ${m.quantity})</option>`; });

  const expListEl = document.getElementById('expiryListDisplay');
  const expMeds = allMedicines.filter(m => m.expiry).map(m => {
    const diffDays = Math.ceil((new Date(m.expiry) - new Date()) / (1000 * 60 * 60 * 24));
    return { ...m, diffDays };
  }).filter(m => m.diffDays <= 30).sort((a,b) => a.diffDays - b.diffDays);

  if (expMeds.length === 0) { expListEl.innerHTML = '<p style="text-align:center; color:#a0aec0; font-size:13px;">ምንም የማለቂያ ቀን ማሳወቂያ የለም።</p>'; }
  else {
    let expHtml = '';
    expMeds.forEach(m => {
      const isExpired = m.diffDays < 0;
      expHtml += `<div class="list-item" style="${isExpired ? 'background:#fff5f5; border:1px solid #fed7d7;' : 'background:#fffaf0; border:1px solid #fbd38d;'}"><div class="info"><div class="name">${m.name}</div><div class="meta">📦 ${m.batch || '-'} | 📅 ${m.expiry}</div></div><div class="amount ${isExpired ? 'red' : ''}" style="font-size:12px;">${isExpired ? '🚨 ጊዜው አልፏል!' : `⚠️ ${m.diffDays} ቀን`}</div></div>`;
    });
    expListEl.innerHTML = expHtml;
  }

  const lowStockEl = document.getElementById('lowStockListDisplay');
  const lowMeds = allMedicines.filter(m => m.quantity <= lowStockThreshold).sort((a,b) => a.quantity - b.quantity);
  if (lowMeds.length === 0) { lowStockEl.innerHTML = '<p style="text-align:center; color:#a0aec0; font-size:13px;">ምንም የሚያልቅ ክምችት የለም።</p>'; }
  else {
    let lowHtml = '';
    lowMeds.forEach(m => {
      lowHtml += `<div class="list-item" style="background:#fffaf0; border:1px solid #fbd38d;"><div class="info"><div class="name">${m.name}</div><div class="meta">📁 ${m.category} → ${m.subcategory}</div></div><div class="amount red" style="font-size:13px;">${m.quantity} ቀሪ</div></div>`;
    });
    lowStockEl.innerHTML = lowHtml;
  }
}

window.adjustStock = async function() {
  const id = document.getElementById('adjustMedId').value;
  const qty = parseInt(document.getElementById('adjustQty').value);
  if(!id || isNaN(qty) || qty < 0) { alert('ምርት እና ትክክለኛ ብዛት ምረጥ'); return; }
  try {
    await updateDoc(doc(db, 'medicines', id), { quantity: qty });
    alert('✅ ክምችት ተስተካክሏል!');
    document.getElementById('adjustQty').value = '';
    document.getElementById('adjustReason').value = '';
    loadAllData();
  } catch(e) { alert(e.message); }
};

// ---- Reports & Dashboard ----
async function loadDailyReport() {
  const dateInput = document.getElementById('dailyReportDate');
  if(!dateInput.value) dateInput.value = new Date().toISOString().split('T')[0];
  const selDate = dateInput.value;
  const branch = document.getElementById('dailyReportBranch').value;

  let daySales = allSales.filter(s => s.date === selDate);
  let dayExp = allExpenses.filter(e => e.date === selDate);
  if (branch !== 'all') {
    daySales = daySales.filter(s => s.branch === branch);
    dayExp = dayExp.filter(e => e.branch === branch);
  }

  let totalRev = 0, totalExp = 0;
  let cashRev = 0, transferRev = 0, creditRev = 0, creditTotal = 0;
  let salesHtml = '', quickHtml = '', expHtml = '', unsoldHtml = '';
  const soldIds = new Set();

  daySales.forEach(s => {
    totalRev += s.paidAmount !== undefined ? s.paidAmount : s.total;
    if (s.paymentMethod === 'transfer') transferRev += (s.paidAmount !== undefined ? s.paidAmount : s.total);
    else if (s.paymentMethod === 'credit') { creditRev += (s.paidAmount || 0); creditTotal += s.total; }
    else cashRev += (s.paidAmount !== undefined ? s.paidAmount : s.total);
    
    soldIds.add(s.medicineId);
    const pmLabel = s.paymentMethod === 'transfer' ? '🏦' : (s.paymentMethod === 'credit' ? '📝' : '💵');
    salesHtml += `<div class="list-item"><div class="info"><div class="name">${s.medicineName}</div><div class="meta">x${s.quantity} x ${s.unitPrice} ብር ${pmLabel}${s.customer ? ' | 🏪 '+s.customer : (s.branch && s.branch !== 'all' ? ' | 🏢 '+s.branch : '')}${s.receipt ? ' | 🧾 '+s.receipt : ''}</div></div><div class="amount">${(s.paidAmount !== undefined ? s.paidAmount : s.total).toFixed(2)} ብር</div></div>`;
  });

  const qQuick = query(collection(db, 'quickSales'), where('date', '==', selDate), where('pharmacyId', '==', currentUserPharmacyId));
  const dayQuick = await getDocs(qQuick);
  dayQuick.forEach(d => {
    const q = d.data(); 
    if (branch !== 'all' && q.branch !== branch) return;
    totalRev += q.amount;
    cashRev += q.amount;
    quickHtml += `<div class="list-item"><div class="info"><div class="name">⚡ ${q.category}</div></div><div class="amount">${q.amount.toFixed(2)} ብር</div></div>`;
  });

  dayExp.forEach(e => {
    totalExp += e.amount;
    expHtml += `<div class="list-item"><div class="info"><div class="name">${e.category}</div>${e.note?'<div class="meta">'+e.note+'</div>':''}</div><div class="amount red">-${e.amount.toFixed(2)} ብር</div></div>`;
  });

  allMedicines.forEach(m => {
    if(!soldIds.has(m.id)) unsoldHtml += `<div class="list-item"><div class="info"><div class="name">${m.name}</div><div class="meta">ቀሪ: ${m.quantity}</div></div></div>`;
  });

  document.getElementById('dailyTotalRevenue').innerHTML = totalRev.toFixed(2) + ' <small>ብር</small>';
  document.getElementById('dailyTotalExpense').innerHTML = totalExp.toFixed(2) + ' <small>ብር</small>';
  document.getElementById('dailyNetProfit').innerHTML = (totalRev - totalExp).toFixed(2) + ' <small>ብር</small>';
  document.getElementById('dailySalesList').innerHTML = salesHtml + quickHtml || '<p style="text-align:center; color:#a0aec0; font-size:13px;">ምንም ሽያጭ የለም።</p>';
  document.getElementById('dailyUnsoldList').innerHTML = unsoldHtml || '<p style="text-align:center; color:#a0aec0; font-size:13px;">ሁሉም ተሽጠዋል።</p>';

  document.getElementById('dailyPaymentSummary').innerHTML = `
    <div class="list-item"><div class="info"><div class="name">💵 Cash</div></div><div class="amount">${cashRev.toFixed(2)} ብር</div></div>
    <div class="list-item"><div class="info"><div class="name">🏦 Transfer</div></div><div class="amount">${transferRev.toFixed(2)} ብር</div></div>
    <div class="list-item"><div class="info"><div class="name">📝 Credit (የተከፈለ)</div></div><div class="amount">${creditRev.toFixed(2)} ብር</div></div>
    <div class="list-item" style="background:#fffaf0;"><div class="info"><div class="name">📊 Credit ጠቅላላ ሽያጭ</div></div><div class="amount">${creditTotal.toFixed(2)} ብር</div></div>
  `;
}

async function loadMonthlyReport() {
  const monthInput = document.getElementById('monthlyReportMonth');
  if(!monthInput.value) monthInput.value = new Date().toISOString().slice(0,7);
  const selMonth = monthInput.value;
  const branch = document.getElementById('monthlyReportBranch').value;

  let monthSales = allSales.filter(s => s.date && s.date.startsWith(selMonth));
  let monthExp = allExpenses.filter(e => e.date && e.date.startsWith(selMonth));
  if (branch !== 'all') {
    monthSales = monthSales.filter(s => s.branch === branch);
    monthExp = monthExp.filter(e => e.branch === branch);
  }
  
  const qMonthQuick = query(collection(db, 'quickSales'), where('date', '>=', selMonth + '-01'), where('date', '<=', selMonth + '-31'), where('pharmacyId', '==', currentUserPharmacyId));
  const snapQuick = await getDocs(qMonthQuick);

  let fixedTotal = 0;
  allFixed.filter(f => f.month === selMonth).forEach(f => fixedTotal += f.amount);

  let totalRev = 0, totalExp = 0;
  let cashRev = 0, transferRev = 0, creditRev = 0, creditTotal = 0;
  let salesHtml = '', unsoldHtml = '';
  const soldIds = new Set();

  monthSales.forEach(s => {
    totalRev += s.paidAmount !== undefined ? s.paidAmount : s.total;
    if (s.paymentMethod === 'transfer') transferRev += (s.paidAmount !== undefined ? s.paidAmount : s.total);
    else if (s.paymentMethod === 'credit') { creditRev += (s.paidAmount || 0); creditTotal += s.total; }
    else cashRev += (s.paidAmount !== undefined ? s.paidAmount : s.total);
    
    soldIds.add(s.medicineId);
    const pmLabel = s.paymentMethod === 'transfer' ? '🏦' : (s.paymentMethod === 'credit' ? '📝' : '💵');
    salesHtml += `<div class="list-item"><div class="info"><div class="name">${s.medicineName}</div><div class="meta">${s.date} | x${s.quantity} ${pmLabel}${s.customer ? ' | 🏪 '+s.customer : (s.branch && s.branch !== 'all' ? ' | 🏢 '+s.branch : '')}</div></div><div class="amount">${(s.paidAmount !== undefined ? s.paidAmount : s.total).toFixed(2)} ብር</div></div>`;
  });
  snapQuick.forEach(d => {
    const q = d.data(); 
    if (branch !== 'all' && q.branch !== branch) return;
    totalRev += q.amount;
    cashRev += q.amount;
    salesHtml += `<div class="list-item"><div class="info"><div class="name">⚡ ${q.category}</div><div class="meta">${q.date}</div></div><div class="amount">${q.amount.toFixed(2)} ብር</div></div>`;
  });
  monthExp.forEach(e => totalExp += e.amount);

  allMedicines.forEach(m => {
    if(!soldIds.has(m.id)) unsoldHtml += `<div class="list-item"><div class="info"><div class="name">${m.name}</div><div class="meta">ቀሪ: ${m.quantity}</div></div></div>`;
  });

  const netProfit = totalRev - totalExp - fixedTotal;

  document.getElementById('monthlyTotalRevenue').innerHTML = totalRev.toFixed(2) + ' <small>ብር</small>';
  document.getElementById('monthlyTotalExpense').innerHTML = totalExp.toFixed(2) + ' <small>ብር</small>';
  document.getElementById('monthlyFixedExpense').innerHTML = fixedTotal.toFixed(2) + ' <small>ብር</small>';
  document.getElementById('monthlyNetProfit').innerHTML = netProfit.toFixed(2) + ' <small>ብር</small>';
  document.getElementById('monthlySalesList').innerHTML = salesHtml || '<p style="text-align:center; color:#a0aec0; font-size:13px;">ምንም ሽያጭ የለም።</p>';
  document.getElementById('monthlyUnsoldList').innerHTML = unsoldHtml || '<p style="text-align:center; color:#a0aec0; font-size:13px;">ሁሉም ተሽጠዋል።</p>';

  document.getElementById('monthlyPaymentSummary').innerHTML = `
    <div class="list-item"><div class="info"><div class="name">💵 Cash</div></div><div class="amount">${cashRev.toFixed(2)} ብር</div></div>
    <div class="list-item"><div class="info"><div class="name">🏦 Transfer</div></div><div class="amount">${transferRev.toFixed(2)} ብር</div></div>
    <div class="list-item"><div class="info"><div class="name">📝 Credit (የተከፈለ)</div></div><div class="amount">${creditRev.toFixed(2)} ብር</div></div>
    <div class="list-item" style="background:#fffaf0;"><div class="info"><div class="name">📊 Credit ጠቅላላ ሽያጭ</div></div><div class="amount">${creditTotal.toFixed(2)} ብር</div></div>
  `;
}

async function loadDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const month = today.substring(0,7);

  const tSales = allSales.filter(s => s.date === today); let tRev = 0; tSales.forEach(s => tRev += (s.paidAmount !== undefined ? s.paidAmount : s.total));
  const tExp = allExpenses.filter(e => e.date === today); let tExpSum = 0; tExp.forEach(e => tExpSum += e.amount);
  
  const qTQuick = query(collection(db, 'quickSales'), where('date', '==', today), where('pharmacyId', '==', currentUserPharmacyId));
  const tQuickSnap = await getDocs(qTQuick);
  tQuickSnap.forEach(d => tRev += d.data().amount);

  document.getElementById('dashTodayRevenue').innerHTML = tRev.toFixed(2) + ' <small>ብር</small>';
  document.getElementById('dashTodayExpense').innerHTML = tExpSum.toFixed(2) + ' <small>ብር</small>';
  document.getElementById('dashTodayProfit').innerHTML = (tRev - tExpSum).toFixed(2) + ' <small>ብር</small>';

  const mSales = allSales.filter(s => s.date && s.date.startsWith(month)); let mRev = 0; mSales.forEach(s => mRev += (s.paidAmount !== undefined ? s.paidAmount : s.total));
  const mExp = allExpenses.filter(e => e.date && e.date.startsWith(month)); let mExpSum = 0; mExp.forEach(e => mExpSum += e.amount);
  
  const qMQuick = query(collection(db, 'quickSales'), where('date', '>=', month + '-01'), where('date', '<=', month + '-31'), where('pharmacyId', '==', currentUserPharmacyId));
  const mQuickSnap = await getDocs(qMQuick);
  mQuickSnap.forEach(d => mRev += d.data().amount);

  document.getElementById('dashMonthRevenue').innerHTML = mRev.toFixed(2) + ' <small>ብር</small>';
  document.getElementById('dashMonthExpense').innerHTML = mExpSum.toFixed(2) + ' <small>ብር</small>';
  document.getElementById('dashMonthProfit').innerHTML = (mRev - mExpSum).toFixed(2) + ' <small>ብር</small>';

  renderCharts();
}

function renderCharts() {
  const c1 = document.getElementById('dailyChart'); if (!c1) return;
  const l = [], d = [];
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const ds = dt.toISOString().split('T')[0];
    l.push(dt.getDate() + '/' + (dt.getMonth()+1));
    const h = allSales.filter(s => s.date === ds).reduce((a,b) => a + (b.paidAmount !== undefined ? b.paidAmount : b.total), 0);
    d.push(h);
  }
  if (dailyChartInstance) dailyChartInstance.destroy();
  dailyChartInstance = new Chart(c1, { type: 'bar', data: { labels: l, datasets: [{ label: 'ሽያጭ', data: d, backgroundColor: '#2c5282', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false } });

  const c2 = document.getElementById('expensePieChart'); if (!c2) return;
  const month = new Date().toISOString().substring(0,7);
  let varTotal = allExpenses.filter(e => e.date && e.date.startsWith(month)).reduce((a,b) => a + b.amount, 0);
  let fixTotal = allFixed.filter(f => f.month === month).reduce((a,b) => a + b.amount, 0);
  if (varTotal === 0 && fixTotal === 0) { if (expensePieChartInstance) expensePieChartInstance.destroy(); return; }
  if (expensePieChartInstance) expensePieChartInstance.destroy();
  expensePieChartInstance = new Chart(c2, { type: 'doughnut', data: { labels: ['ተለዋዋጭ', 'ቋሚ'], datasets: [{ data: [varTotal, fixTotal], backgroundColor: ['#c53030', '#dd6b20'] }] }, options: { responsive: true, maintainAspectRatio: false } });
}

// ---- Credit Management ----
function populateCreditCustomerSelect() {
  const sel = document.getElementById('creditPayCustomer');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- ደንበኛ ምረጥ --</option>';
  allCustomers.forEach(c => { sel.innerHTML += `<option value="${c}">${c}</option>`; });
}

function calculateCustomerDebt(customerName) {
  let totalCredit = 0, totalPaid = 0;
  allSales.forEach(s => {
    if (s.customer === customerName && s.paymentMethod === 'credit') {
      totalCredit += s.total;
      totalPaid += (s.paidAmount || 0);
    }
  });
  allCreditPayments.forEach(p => {
    if (p.customer === customerName) totalPaid += p.amount;
  });
  return { totalCredit, totalPaid, balance: totalCredit - totalPaid };
}

window.renderCreditList = function() {
  const listEl = document.getElementById('creditCustomerList');
  if (!listEl) return;
  if (allCustomers.length === 0) { listEl.innerHTML = '<p style="text-align:center; color:#a0aec0; font-size:13px;">ምንም ደንበኛ የለም።</p>'; return; }
  
  let html = '';
  allCustomers.forEach(c => {
    const { totalCredit, totalPaid, balance } = calculateCustomerDebt(c);
    if (totalCredit === 0) return;
    const color = balance > 0 ? '#c53030' : '#276749';
    html += `<div class="list-item"><div class="info"><div class="name">${c}</div><div class="meta">ጠቅላላ ዱቤ: ${totalCredit.toFixed(2)} | የተከፈለ: ${totalPaid.toFixed(2)}</div></div><div class="amount" style="color:${color};">${balance.toFixed(2)} ብር</div></div>`;
  });
  listEl.innerHTML = html || '<p style="text-align:center; color:#a0aec0; font-size:13px;">ምንም ዕዳ የለም።</p>';
};

window.addCreditPayment = async function() {
  const customer = document.getElementById('creditPayCustomer').value;
  const amount = parseFloat(document.getElementById('creditPayAmount').value);
  const date = document.getElementById('creditPayDate').value;
  if (!customer || isNaN(amount) || amount <= 0 || !date) { alert('ሁሉንም መረጃዎች ሙላ'); return; }
  try {
    await addDoc(collection(db, 'creditPayments'), { customer, amount, date, timestamp: serverTimestamp(), pharmacyId: currentUserPharmacyId });
    alert('✅ ክፍያ ተመዝግቧል!');
    document.getElementById('creditPayAmount').value = '';
    loadAllData();
    renderCreditList();
  } catch(e) { alert(e.message); }
};

// ---- Settings & Utilities ----
async function loadSettings() {
  if(currentUserPharmacyId) {
    const d = await getDoc(doc(db, 'pharmacies', currentUserPharmacyId));
    if(d.exists()) {
      document.getElementById('settingPharmacyName').value = d.data().name || '';
      currentBizType = d.data().bizType || 'retail';
      lowStockThreshold = d.data().lowStockThreshold || 10;
      document.getElementById('settingBizType').value = currentBizType;
      document.getElementById('settingLowStockThreshold').value = lowStockThreshold;
    }
  }
  applyBizTypeUI();
  const qc = document.getElementById('quickCat');
  qc.innerHTML = '<option value="">-- ምድብ ምረጥ --</option>';
  allCategories.forEach(c => { qc.innerHTML += `<option value="${c}">${c}</option>`; });
  renderCreditList();
}

window.savePharmacyName = async function() {
  const name = document.getElementById('settingPharmacyName').value.trim();
  if(!name || !currentUserPharmacyId) return;
  try {
    await updateDoc(doc(db, 'pharmacies', currentUserPharmacyId), { name: name });
    document.getElementById('hdrPharmacyName').innerText = '💊 ' + name;
    alert('✅ ተቀይሯል!');
  } catch(e) { alert(e.message); }
};

window.saveBizType = async function() {
  const type = document.getElementById('settingBizType').value;
  currentBizType = type;
  if (currentUserPharmacyId) {
    try { await updateDoc(doc(db, 'pharmacies', currentUserPharmacyId), { bizType: type }); } catch(e) { console.error(e); }
  }
  applyBizTypeUI();
  loadAllData();
};

window.saveLowStockThreshold = async function() {
  const val = parseInt(document.getElementById('settingLowStockThreshold').value);
  if (isNaN(val) || val < 1) { alert('ትክክለኛ ቁጥር አስገባ'); return; }
  lowStockThreshold = val;
  if (currentUserPharmacyId) {
    try { await updateDoc(doc(db, 'pharmacies', currentUserPharmacyId), { lowStockThreshold: val }); } catch(e) { console.error(e); }
  }
  loadInventory();
  alert('✅ ተቀምጧል!');
};

window.changePassword = async function() {
  const currentPass = document.getElementById('currentPass').value;
  const newPass = document.getElementById('newPass').value;
  if (!currentPass || !newPass) { alert('ሁለቱንም ፓስወርዶች ሙላ'); return; }
  if (newPass.length < 6) { alert('አዲሱ ፓስወርድ ቢያንስ 6 ፊደል ይሁን'); return; }
  try {
    const user = auth.currentUser;
    const credential = EmailAuthProvider.credential(user.email, currentPass);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPass);
    alert('✅ ፓስወርድ ተቀይሯል!');
    document.getElementById('currentPass').value = '';
    document.getElementById('newPass').value = '';
  } catch (err) { alert('ስህተት: ' + err.message); }
};

window.toggleDarkMode = function() {
  const isDark = document.getElementById('darkModeToggle').checked;
  if (isDark) { document.body.classList.add('dark'); } else { document.body.classList.remove('dark'); }
  localStorage.setItem('pharmacy_dark', isDark ? '1' : '0');
};

function loadDarkMode() {
  const saved = localStorage.getItem('pharmacy_dark');
  if (saved === '1') {
    document.body.classList.add('dark');
    const cb = document.getElementById('darkModeToggle');
    if (cb) cb.checked = true;
  }
}

window.enableNotifications = async function() {
  const status = document.getElementById('notifStatus');
  if (!('Notification' in window)) { status.textContent = '❌ አይደግፍም'; return; }
  try { 
    const perm = await Notification.requestPermission(); 
    if (perm === 'granted') { status.textContent = '✅ ተነስቷል'; status.style.color = '#38a169'; } 
    else { status.textContent = '❌ አልተፈቀደም'; status.style.color = '#c53030'; } 
  } catch (e) { status.textContent = '❌ ' + e.message; }
};

window.testNotification = function() {
  if (Notification.permission !== 'granted') { alert('⚠️ መጀመሪያ Notification አስነሳ'); return; }
  new Notification('💊 የፋርማሲ ማስታወሻ', { body: 'የዛሬ ሽያጭ አስገባ! 📊' });
};

window.exportBackup = async function() {
  const statusEl = document.getElementById('backupStatus');
  statusEl.textContent = '⏳ ዳታ በመሰብሰብ ላይ...';
  try {
    const data = { exportedAt: new Date().toISOString(), medicines: allMedicines, categories: allCategories, branches: allBranches, customers: allCustomers, sales: allSales, expenses: allExpenses, fixed: allFixed, creditPayments: allCreditPayments };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `pharmacy-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    statusEl.textContent = '✅ ዳታ ወርዷል!'; statusEl.style.color = '#38a169';
  } catch(e) { statusEl.textContent = '❌ ' + e.message; statusEl.style.color = '#c53030'; }
};

window.importBackup = function(event) {
  const file = event.target.files[0]; if (!file) return;
  if (!confirm('⚠️ ዳታ መመለስ አሁን ያለውን ዳታ ይተካል! እርግጠኛ ነህ?')) { event.target.value = ''; return; }
  const statusEl = document.getElementById('backupStatus');
  statusEl.textContent = '⏳ በመመለስ ላይ...';
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      for (const m of data.medicines || []) { const { id, ...rest } = m; await setDoc(doc(db, 'medicines', id), rest); }
      for (const s of data.sales || []) { const { id, ...rest } = s; await setDoc(doc(db, 'sales', id), rest); }
      for (const ex of data.expenses || []) { const { id, ...rest } = ex; await setDoc(doc(db, 'expenses', id), rest); }
      for (const fx of data.fixed || []) { const { id, ...rest } = fx; await setDoc(doc(db, 'fixedExpenses', id), rest); }
      for (const cp of data.creditPayments || []) { const { id, ...rest } = cp; await setDoc(doc(db, 'creditPayments', id), rest); }
      statusEl.textContent = '✅ ዳታ ተመልሷል!'; statusEl.style.color = '#38a169';
      loadAllData();
    } catch(err) { statusEl.textContent = '❌ ' + err.message; statusEl.style.color = '#c53030'; }
  };
  reader.readAsText(file); event.target.value = '';
};

window.resetSelectedDate = async function() {
  const date = document.getElementById('dailyReportDate').value;
  if(!date) { alert('ቀን ምረጥ'); return; }
  if(!confirm(`የ ${date} ሽያጭ እና ወጪ ማጥፋት ትፈልጋለህ?`)) return;
  try {
    const batch = writeBatch(db);
    const sSnap = await getDocs(query(collection(db, 'sales'), where('date', '==', date), where('pharmacyId', '==', currentUserPharmacyId)));
    sSnap.forEach(d => batch.delete(d.ref));
    const eSnap = await getDocs(query(collection(db, 'expenses'), where('date', '==', date), where('pharmacyId', '==', currentUserPharmacyId)));
    eSnap.forEach(d => batch.delete(d.ref));
    const qSnap = await getDocs(query(collection(db, 'quickSales'), where('date', '==', date), where('pharmacyId', '==', currentUserPharmacyId)));
    qSnap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    alert('✅ ተጠፍቷል!');
    loadAllData();
  } catch(e) { alert(e.message); }
};

window.printReport = function() {
  const monthLabel = document.getElementById('monthlyReportMonth').value;
  const tRev = document.getElementById('monthlyTotalRevenue').innerText;
  const tExp = document.getElementById('monthlyTotalExpense').innerText;
  const tFix = document.getElementById('monthlyFixedExpense').innerText;
  const tNet = document.getElementById('monthlyNetProfit').innerText;
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Pharmacy Report - ${monthLabel}</title><style>body{font-family:Arial;padding:20px}h1{color:#2b6cb0}h2{color:#4a5568}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #cbd5e0;padding:10px}th{background:#ebf4ff}</style></head><body><h1>💊 Hanitech Pharmacy Report</h1><h2>📅 ${monthLabel}</h2><table><tr><th>መግለጫ</th><th>መጠን</th></tr><tr><td>ገቢ</td><td>${tRev}</td></tr><tr><td>ተለዋዋጭ ወጪ</td><td>${tExp}</td></tr><tr><td>ቋሚ ወጪ</td><td>${tFix}</td></tr><tr><td>ትርፍ</td><td>${tNet}</td></tr></table><script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script></body></html>`);
  w.document.close();
};

window.exportExcel = function() {
  if (allSales.length === 0) { alert('ውሂብ የለም'); return; }
  let csv = '\uFEFFቀን,ምርት,ብዛት,ዋጋ,ጠቅላላ,የክፍያ ዓይነት,የተከፈለ,ቅርንጫፍ,ደንበኛ,ደረሰኝ\n';
  allSales.forEach(s => { csv += `"${s.date}","${s.medicineName}",${s.quantity},${s.unitPrice},${s.total},"${s.paymentMethod||'cash'}",${s.paidAmount !== undefined ? s.paidAmount : s.total},"${s.branch||''}","${s.customer||''}","${s.receipt||''}"\n`; });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `pharmacy-sales-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
};

window.savePermissions = async function() {
  if(!currentUserPharmacyId) return;
  const perms = {
    manager: {
      med: document.getElementById('tabperm_mgr_med').checked,
      sell: document.getElementById('tabperm_mgr_sell').checked,
      exp: document.getElementById('tabperm_mgr_exp').checked,
      inv: document.getElementById('tabperm_mgr_inv').checked,
      daily: document.getElementById('tabperm_mgr_daily').checked,
      monthly: document.getElementById('tabperm_mgr_monthly').checked,
      dash: document.getElementById('tabperm_mgr_dash').checked,
      settings: document.getElementById('tabperm_mgr_settings').checked
    },
    accountant: {
      med: document.getElementById('tabperm_acc_med').checked,
      sell: document.getElementById('tabperm_acc_sell').checked,
      exp: document.getElementById('tabperm_acc_exp').checked,
      inv: document.getElementById('tabperm_acc_inv').checked,
      daily: document.getElementById('tabperm_acc_daily').checked,
      monthly: document.getElementById('tabperm_acc_monthly').checked,
      dash: document.getElementById('tabperm_acc_dash').checked,
      settings: document.getElementById('tabperm_acc_settings').checked
    }
  };
  try {
    await setDoc(doc(db, 'pharmacies', currentUserPharmacyId, 'settings', 'permissions'), perms);
    alert('✅ ፈቃዶች ተቀምጠዋል!');
  } catch(e) { alert(e.message); }
};

function checkExpiryAlerts() {
  const banner = document.getElementById('expiryBanner');
  const bannerText = document.getElementById('expiryBannerText');
  const today = new Date(); today.setHours(0,0,0,0);
  let expiredCount = 0;
  let expiringSoonCount = 0;

  allMedicines.forEach(med => {
    if (!med.expiry) return;
    const expiryDate = new Date(med.expiry);
    const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) expiredCount++;
    else if (diffDays <= 30) expiringSoonCount++;
  });

  if (expiredCount > 0 || expiringSoonCount > 0) {
    banner.style.display = 'block';
    let msg = '';
    if (expiredCount > 0) msg += `${expiredCount} ምርት ጊዜው አልፏል! `;
    if (expiringSoonCount > 0) msg += `${expiringSoonCount} ምርት በ30 ቀን ውስጥ ያልቃል!`;
    bannerText.textContent = msg;
  } else {
    banner.style.display = 'none';
  }
}

const today = new Date().toISOString().split('T')[0];
document.getElementById('sellDate').value = today;
document.getElementById('expDate').value = today;
document.getElementById('quickDate').value = today;
document.getElementById('fixMonth').value = today.substring(0,7);
document.getElementById('creditPayDate').value = today;
