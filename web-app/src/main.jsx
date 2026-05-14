import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BadgePercent,
  Bell,
  CalendarClock,
  Car,
  ChevronDown,
  CloudSun,
  CreditCard,
  Home,
  Inbox,
  LogOut,
  MapPin,
  Menu,
  RefreshCw,
  UserCircle,
  X
} from "lucide-react";
import "./styles.css";

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || "http://localhost:5100";

const initialBookingForm = {
  startingLocation: "Valletta",
  endingLocation: "Sliema",
  bookingDateTime: "2026-06-07T18:30",
  passengers: 2,
  cabType: "Economic"
};

const initialLocationForm = {
  label: "Home",
  address: "Valletta",
  latitude: 35.8989,
  longitude: 14.5146
};

async function apiRequest(path, options = {}) {
  const response = await fetch(`${GATEWAY_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `Request failed with status ${response.status}`);
  }

  return payload.data;
}

function formatDate(value) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString();
}

function formatMoney(value, currency = "EUR") {
  const amount = Number(value);
  return `${currency} ${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`;
}

function getCabMultiplier(cabType) {
  return { Economic: 1, Premium: 1.2, Executive: 1.4 }[cabType] || 1;
}

function getPassengersMultiplier(passengers) {
  const count = Number(passengers);
  return count <= 4 ? 1 : 2;
}

function getDaytimeMultiplier(bookingDateTime) {
  const hour = new Date(bookingDateTime).getHours();
  return hour >= 0 && hour < 8 ? 1.2 : 1;
}

function estimatePayableTotal(booking, useDiscount) {
  const fare = Number(booking.estimatedFare?.amount || 0);
  const total =
    fare *
    getCabMultiplier(booking.cabType) *
    getDaytimeMultiplier(booking.bookingDateTime) *
    getPassengersMultiplier(booking.passengers) *
    (useDiscount ? 0.9 : 1);

  return Number(total.toFixed(2));
}

function App() {
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    firstName: "Test",
    surname: "User",
    email: "",
    password: "Password123"
  });
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("cabUser");
    return stored ? JSON.parse(stored) : null;
  });
  const [activeView, setActiveView] = useState("dashboard");
  const [bookingForm, setBookingForm] = useState(initialBookingForm);
  const [locationForm, setLocationForm] = useState(initialLocationForm);
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [currentBookings, setCurrentBookings] = useState([]);
  const [pastBookings, setPastBookings] = useState([]);
  const [payments, setPayments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [weatherByLocation, setWeatherByLocation] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const userId = user?.userId;
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );
  const userInitials = `${user?.firstName?.[0] || ""}${user?.surname?.[0] || ""}` || "U";

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: Home },
    { id: "book", label: "Create Booking", icon: Car },
    { id: "bookings", label: "Bookings", icon: CalendarClock },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "locations", label: "Locations", icon: MapPin }
  ];

  async function runAction(action, successMessage) {
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const result = await action();
      if (successMessage) setMessage(successMessage);
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function refreshAll(activeUserId = userId) {
    if (!activeUserId) return;

    const [account, current, past, paymentHistory, savedLocations, inbox] =
      await Promise.all([
        apiRequest(`/api/customers/${activeUserId}`),
        apiRequest(`/api/bookings/current/${activeUserId}`),
        apiRequest(`/api/bookings/past/${activeUserId}`),
        apiRequest(`/api/payments/user/${activeUserId}`),
        apiRequest(`/api/locations/user/${activeUserId}`),
        apiRequest(`/api/customers/${activeUserId}/notifications`)
      ]);

    setUser(account);
    localStorage.setItem("cabUser", JSON.stringify(account));
    setCurrentBookings(current);
    setPastBookings(past);
    setPayments(paymentHistory);
    setLocations(savedLocations);
    setNotifications(inbox);
  }

  async function refreshAccountAndNotifications(activeUserId = userId) {
    if (!activeUserId) return;

    const [account, inbox] = await Promise.all([
      apiRequest(`/api/customers/${activeUserId}`),
      apiRequest(`/api/customers/${activeUserId}/notifications`)
    ]);

    setUser(account);
    localStorage.setItem("cabUser", JSON.stringify(account));
    setNotifications(inbox);
  }

  useEffect(() => {
    if (userId) {
      refreshAll(userId).catch((err) => setError(err.message));
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;

    const intervalId = window.setInterval(() => {
      refreshAccountAndNotifications(userId).catch(() => {});
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [userId]);

  async function submitAuth(event) {
    event.preventDefault();

    await runAction(async () => {
      const path = authMode === "login" ? "/api/customers/login" : "/api/customers/register";
      const body =
        authMode === "login"
          ? { email: authForm.email, password: authForm.password }
          : authForm;
      const data = await apiRequest(path, {
        method: "POST",
        body: JSON.stringify(body)
      });
      const account = data.user || data;

      setUser(account);
      localStorage.setItem("cabUser", JSON.stringify(account));
      await refreshAll(account.userId);
    }, authMode === "login" ? "Logged in." : "Account registered.");
  }

  function logout() {
    localStorage.removeItem("cabUser");
    setUser(null);
    setCurrentBookings([]);
    setPastBookings([]);
    setPayments([]);
    setLocations([]);
    setNotifications([]);
    setWeatherByLocation({});
    setNotificationsOpen(false);
    setUserMenuOpen(false);
  }

  async function createBooking(event) {
    event.preventDefault();

    await runAction(async () => {
      await apiRequest("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          userId,
          ...bookingForm,
          bookingDateTime: new Date(bookingForm.bookingDateTime).toISOString(),
          passengers: Number(bookingForm.passengers)
        })
      });
      await refreshAll();
      setActiveView("bookings");
    }, "Booking created.");
  }

  async function payBooking(bookingId, useDiscount) {
    await runAction(async () => {
      const payment = await apiRequest("/api/payments", {
        method: "POST",
        body: JSON.stringify({ userId, bookingId, useDiscount })
      });
      await refreshAll();
      setActiveView("payments");
      return payment;
    }, useDiscount && user.discountAvailable ? "Payment completed with discount applied." : "Payment completed without discount.");
  }

  async function saveLocation(event) {
    event.preventDefault();

    await runAction(async () => {
      const payload = {
        ...locationForm,
        latitude: Number(locationForm.latitude),
        longitude: Number(locationForm.longitude)
      };

      if (editingLocationId) {
        await apiRequest(`/api/locations/${editingLocationId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await apiRequest("/api/locations", {
          method: "POST",
          body: JSON.stringify({ userId, ...payload })
        });
      }

      setEditingLocationId(null);
      setLocationForm(initialLocationForm);
      await refreshAll();
    }, editingLocationId ? "Favourite location updated." : "Favourite location saved.");
  }

  function loadLocationForEdit(location) {
    setEditingLocationId(location.locationId);
    setLocationForm({
      label: location.label,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude
    });
  }

  async function deleteLocation(locationId) {
    await runAction(async () => {
      await apiRequest(`/api/locations/${locationId}`, { method: "DELETE" });
      await refreshAll();
    }, "Favourite location deleted.");
  }

  async function fetchWeather(locationId) {
    await runAction(async () => {
      const weather = await apiRequest(`/api/locations/${locationId}/weather`);
      setWeatherByLocation((current) => ({ ...current, [locationId]: weather }));
    });
  }

  async function markNotificationRead(notificationId) {
    await runAction(async () => {
      await apiRequest(`/api/customers/${userId}/notifications/${notificationId}/read`, {
        method: "PATCH"
      });
      await refreshAll();
    });
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-brand">
            <div className="brand-mark">
              <Car size={26} />
            </div>
            <div>
              <p className="eyebrow">Cab Booking Platform</p>
              <h1>{authMode === "login" ? "Sign in" : "Create account"}</h1>
            </div>
          </div>

          <form onSubmit={submitAuth} className="form-grid">
            {authMode === "register" && (
              <>
                <label>
                  First name
                  <input
                    value={authForm.firstName}
                    onChange={(event) => setAuthForm({ ...authForm, firstName: event.target.value })}
                    required
                  />
                </label>
                <label>
                  Surname
                  <input
                    value={authForm.surname}
                    onChange={(event) => setAuthForm({ ...authForm, surname: event.target.value })}
                    required
                  />
                </label>
              </>
            )}
            <label className="full">
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                required
              />
            </label>
            <label className="full">
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                required
              />
            </label>
            {error && <p className="error full">{error}</p>}
            {message && <p className="success full">{message}</p>}
            <button type="submit" disabled={loading}>
              {loading ? "Working..." : authMode === "login" ? "Sign in" : "Register"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
            >
              {authMode === "login" ? "Need an account?" : "Already registered?"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className={`app-layout ${mobileMenuOpen ? "menu-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Car size={24} />
          </div>
          <div>
            <strong>Cab Booking</strong>
            <span>Microservices</span>
          </div>
        </div>

        <nav className="menu">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`menu-item ${activeView === item.id ? "active" : ""}`}
                onClick={() => {
                  setActiveView(item.id);
                  setMobileMenuOpen(false);
                }}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">{navItems.find((item) => item.id === activeView)?.label}</p>
            <h1>{getViewTitle(activeView)}</h1>
          </div>

          <div className="topbar-actions">
            <button
              className="icon-button mobile-menu-button"
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              title="Menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <button className="icon-button" type="button" onClick={() => refreshAll()} title="Refresh">
              <RefreshCw size={19} />
            </button>

            <div className="dropdown-wrap">
              <button
                className="icon-button"
                type="button"
                onClick={() => {
                  setNotificationsOpen(!notificationsOpen);
                  setUserMenuOpen(false);
                }}
                title="Notifications"
              >
                <Bell size={20} />
                {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
              </button>
              {notificationsOpen && (
                <div className="dropdown notifications-dropdown">
                  <div className="dropdown-heading">
                    <strong>Notifications</strong>
                    <span>{unreadCount} unread</span>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="empty">No notifications.</p>
                  ) : (
                    notifications.slice(0, 6).map((notification) => (
                      <article
                        className={`notification-row ${notification.read ? "" : "unread"}`}
                        key={notification.notificationId}
                      >
                        <div>
                          <strong>{notification.title}</strong>
                          <p>{notification.message}</p>
                          <span>{formatDate(notification.createdAt)}</span>
                        </div>
                        {!notification.read && (
                          <button
                            className="tiny-button"
                            type="button"
                            onClick={() => markNotificationRead(notification.notificationId)}
                          >
                            Read
                          </button>
                        )}
                      </article>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="dropdown-wrap">
              <button
                className="user-button"
                type="button"
                onClick={() => {
                  setUserMenuOpen(!userMenuOpen);
                  setNotificationsOpen(false);
                }}
              >
                <span className="avatar">{userInitials.toUpperCase()}</span>
                <ChevronDown size={16} />
              </button>
              {userMenuOpen && (
                <div className="dropdown user-dropdown">
                  <UserCircle size={32} />
                  <strong>{user.firstName} {user.surname}</strong>
                  <span>{user.email}</span>
                  <button className="danger full-button" type="button" onClick={logout}>
                    <LogOut size={16} />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {(error || message) && (
          <section className="status-row">
            {error && <p className="error">{error}</p>}
            {message && <p className="success">{message}</p>}
          </section>
        )}

        {activeView === "dashboard" && (
          <Dashboard
            user={user}
            unreadCount={unreadCount}
            payments={payments}
            currentBookings={currentBookings}
            setActiveView={setActiveView}
          />
        )}
        {activeView === "book" && (
          <BookingForm
            bookingForm={bookingForm}
            setBookingForm={setBookingForm}
            createBooking={createBooking}
            loading={loading}
            discountAvailable={user.discountAvailable}
          />
        )}
        {activeView === "bookings" && (
          <BookingsView
            currentBookings={currentBookings}
            pastBookings={pastBookings}
            payBooking={payBooking}
            loading={loading}
            discountAvailable={user.discountAvailable}
          />
        )}
        {activeView === "payments" && <PaymentsView payments={payments} />}
        {activeView === "locations" && (
          <LocationsView
            locationForm={locationForm}
            setLocationForm={setLocationForm}
            editingLocationId={editingLocationId}
            setEditingLocationId={setEditingLocationId}
            saveLocation={saveLocation}
            locations={locations}
            weatherByLocation={weatherByLocation}
            fetchWeather={fetchWeather}
            loadLocationForEdit={loadLocationForEdit}
            deleteLocation={deleteLocation}
            loading={loading}
          />
        )}
      </main>
    </div>
  );
}

function getViewTitle(activeView) {
  const titles = {
    dashboard: "Operational dashboard",
    book: "Create a new cab booking",
    bookings: "Current and past bookings",
    payments: "Payment history",
    locations: "Favourite pickup locations"
  };
  return titles[activeView] || "Dashboard";
}

function Dashboard({ user, unreadCount, payments, currentBookings, setActiveView }) {
  return (
    <section className="dashboard-grid">
      <Metric icon={CalendarClock} label="Successful bookings" value={user.successfulBookingsCount} />
      <Metric
        icon={BadgePercent}
        label="Discount"
        value={user.discountAvailable ? "10% ready" : "Not yet"}
      />
      <Metric icon={Inbox} label="Unread notifications" value={unreadCount} />
      <Metric icon={CreditCard} label="Payments" value={payments.length} />

      <section className="panel wide-panel">
        <div className="section-heading">
          <h2>Next actions</h2>
        </div>
        <div className="action-grid">
          <button type="button" onClick={() => setActiveView("book")}>
            <Car size={18} />
            New booking
          </button>
          <button className="secondary" type="button" onClick={() => setActiveView("locations")}>
            <MapPin size={18} />
            Manage locations
          </button>
          <button className="secondary" type="button" onClick={() => setActiveView("payments")}>
            <CreditCard size={18} />
            View payments
          </button>
        </div>
        {user.discountAvailable && (
          <p className="discount-note">
            A one-time discount is available. You can apply it to a booking or pay normally and keep it for later.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Current bookings</h2>
        {currentBookings.length === 0 ? (
          <p className="empty">No active rides waiting for payment.</p>
        ) : (
          currentBookings.slice(0, 3).map((booking) => (
            <CompactBooking booking={booking} key={booking.bookingId} />
          ))
        )}
      </section>
    </section>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <article className="metric-card">
      <Icon size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function BookingForm({ bookingForm, setBookingForm, createBooking, loading, discountAvailable }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Booking details</h2>
        {discountAvailable && <span className="pill success-pill">10% discount available</span>}
      </div>
      <form onSubmit={createBooking} className="form-grid">
        <label>
          Pickup
          <input
            value={bookingForm.startingLocation}
            onChange={(event) => setBookingForm({ ...bookingForm, startingLocation: event.target.value })}
            required
          />
        </label>
        <label>
          Destination
          <input
            value={bookingForm.endingLocation}
            onChange={(event) => setBookingForm({ ...bookingForm, endingLocation: event.target.value })}
            required
          />
        </label>
        <label>
          Date and time
          <input
            type="datetime-local"
            value={bookingForm.bookingDateTime}
            onChange={(event) => setBookingForm({ ...bookingForm, bookingDateTime: event.target.value })}
            required
          />
        </label>
        <label>
          Passengers
          <input
            type="number"
            min="1"
            max="8"
            value={bookingForm.passengers}
            onChange={(event) => setBookingForm({ ...bookingForm, passengers: event.target.value })}
            required
          />
        </label>
        <label>
          Cab type
          <select
            value={bookingForm.cabType}
            onChange={(event) => setBookingForm({ ...bookingForm, cabType: event.target.value })}
          >
            <option>Economic</option>
            <option>Premium</option>
            <option>Executive</option>
          </select>
        </label>
        <button type="submit" disabled={loading}>
          <Car size={18} />
          Book ride
        </button>
      </form>
    </section>
  );
}

function BookingsView({ currentBookings, pastBookings, payBooking, loading, discountAvailable }) {
  return (
    <div className="content-grid">
      <ListPanel title="Current bookings" emptyText="No current bookings.">
        {currentBookings.map((booking) => {
          const standardTotal = estimatePayableTotal(booking, false);
          const discountTotal = estimatePayableTotal(booking, discountAvailable);

          return (
            <article className="item-card" key={booking.bookingId}>
              <div className="card-title-row">
                <h3>{booking.startingLocation} to {booking.endingLocation}</h3>
                <span className="pill">{booking.cabType}</span>
              </div>
              <p>{formatDate(booking.bookingDateTime)} · {booking.passengers} passengers</p>
              <p>Estimated fare: {formatMoney(booking.estimatedFare?.amount, booking.estimatedFare?.currency)}</p>
              {discountAvailable ? (
                <div className="price-options">
                  <span>Standard: {formatMoney(standardTotal)}</span>
                  <strong>With discount: {formatMoney(discountTotal)}</strong>
                </div>
              ) : (
                <p>Payable now: {formatMoney(standardTotal)}</p>
              )}
              <div className="button-row">
                {discountAvailable && (
                  <button onClick={() => payBooking(booking.bookingId, true)} disabled={loading}>
                    <BadgePercent size={18} />
                    Pay with discount
                  </button>
                )}
                <button
                  className={discountAvailable ? "secondary" : ""}
                  onClick={() => payBooking(booking.bookingId, false)}
                  disabled={loading}
                >
                  <CreditCard size={18} />
                  {discountAvailable ? "Pay without discount" : "Pay"}
                </button>
              </div>
            </article>
          );
        })}
      </ListPanel>

      <ListPanel title="Past bookings" emptyText="No past bookings.">
        {pastBookings.map((booking) => (
          <CompactBooking booking={booking} key={booking.bookingId} />
        ))}
      </ListPanel>
    </div>
  );
}

function CompactBooking({ booking }) {
  return (
    <article className="item-card compact">
      <h3>{booking.startingLocation} to {booking.endingLocation}</h3>
      <p>{formatDate(booking.bookingDateTime)} · {booking.status}</p>
      <p>{booking.cabType} · {booking.passengers} passengers</p>
    </article>
  );
}

function PaymentsView({ payments }) {
  return (
    <ListPanel title="Payment history" emptyText="No payments yet.">
      {payments.map((payment) => (
        <article className="item-card" key={payment.paymentId}>
          <div className="card-title-row">
            <h3>{formatMoney(payment.totalPrice)}</h3>
            <span className="pill">{payment.status}</span>
          </div>
          <p>Base fare {formatMoney(payment.cabFare)} · Cab x{payment.cabMultiplier} · Day x{payment.daytimeMultiplier}</p>
          <p>Passengers x{payment.passengersMultiplier} · Discount x{payment.discountMultiplier}</p>
        </article>
      ))}
    </ListPanel>
  );
}

function LocationsView({
  locationForm,
  setLocationForm,
  editingLocationId,
  setEditingLocationId,
  saveLocation,
  locations,
  weatherByLocation,
  fetchWeather,
  loadLocationForEdit,
  deleteLocation,
  loading
}) {
  return (
    <div className="content-grid">
      <section className="panel">
        <div className="section-heading">
          <h2>{editingLocationId ? "Update location" : "Add favourite location"}</h2>
          {editingLocationId && <span className="pill">Editing</span>}
        </div>
        <form onSubmit={saveLocation} className="form-grid">
          <label>
            Label
            <input
              value={locationForm.label}
              onChange={(event) => setLocationForm({ ...locationForm, label: event.target.value })}
              required
            />
          </label>
          <label>
            Address
            <input
              value={locationForm.address}
              onChange={(event) => setLocationForm({ ...locationForm, address: event.target.value })}
              required
            />
          </label>
          <label>
            Latitude
            <input
              type="number"
              step="any"
              value={locationForm.latitude}
              onChange={(event) => setLocationForm({ ...locationForm, latitude: event.target.value })}
              required
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              step="any"
              value={locationForm.longitude}
              onChange={(event) => setLocationForm({ ...locationForm, longitude: event.target.value })}
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            <MapPin size={18} />
            {editingLocationId ? "Update location" : "Save location"}
          </button>
          {editingLocationId && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEditingLocationId(null);
                setLocationForm(initialLocationForm);
              }}
            >
              Cancel
            </button>
          )}
        </form>
      </section>

      <ListPanel title="Saved locations" emptyText="No saved locations.">
        {locations.map((location) => {
          const weather = weatherByLocation[location.locationId];
          return (
            <article className="item-card" key={location.locationId}>
              <div className="card-title-row">
                <h3>{location.label}</h3>
                <span className="pill">{location.address}</span>
              </div>
              <p>{location.latitude}, {location.longitude}</p>
              {weather && (
                <p>
                  <CloudSun size={16} />
                  {weather.current?.condition} · {weather.current?.temperatureC}°C · {weather.source}
                </p>
              )}
              <div className="button-row">
                <button className="secondary" onClick={() => fetchWeather(location.locationId)}>
                  Weather
                </button>
                <button className="secondary" onClick={() => loadLocationForEdit(location)}>
                  Edit
                </button>
                <button className="danger" onClick={() => deleteLocation(location.locationId)}>
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </ListPanel>
    </div>
  );
}

function ListPanel({ title, emptyText, children }) {
  const items = React.Children.toArray(children).filter(Boolean);

  return (
    <section className="panel list-panel">
      <h2>{title}</h2>
      {items.length > 0 ? items : <p className="empty">{emptyText}</p>}
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
