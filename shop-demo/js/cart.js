// ============ Cart Module ============
const CART_KEY = 'atlas_cart';

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}

function addToCart(productId, color, size, quantity = 1) {
  const cart = getCart();
  const existing = cart.find(item =>
    item.productId === productId && item.color === color && item.size === size
  );

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ productId, color, size, quantity });
  }

  saveCart(cart);
  showToast(`${getProduct(productId).name} — Added to cart`);
}

function removeFromCart(index) {
  const cart = getCart();
  if (index >= 0 && index < cart.length) {
    cart.splice(index, 1);
    saveCart(cart);
  }
}

function updateQuantity(index, delta) {
  const cart = getCart();
  if (index >= 0 && index < cart.length) {
    cart[index].quantity += delta;
    if (cart[index].quantity <= 0) {
      cart.splice(index, 1);
    }
    saveCart(cart);
  }
}

function clearCart() {
  saveCart([]);
}

function getCartTotal() {
  return getCart().reduce((sum, item) => {
    const product = getProduct(item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);
}

function getCartCount() {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

function updateCartCount() {
  const count = getCartCount();
  document.querySelectorAll('.cart-count').forEach(el => {
    if (count > 0) {
      el.textContent = count;
      el.classList.add('bump');
      setTimeout(() => el.classList.remove('bump'), 300);
    } else {
      el.textContent = '';
    }
  });
}

// Shared toast
function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// Initialize cart count on page load
document.addEventListener('DOMContentLoaded', updateCartCount);
