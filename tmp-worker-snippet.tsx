        {activeNav === 'workers' && isOwner ? (
          <section className="dashboard-grid wide-left">
            <Panel eyebrow="Staff directory" title="Worker access control">
              <div className="worker-toolbar">
                <button type="button" className="primary-btn" onClick={() => setShowWorkerCreateModal(true)}>
                  <Plus size={16} />Add worker
                </button>
                <div className="worker-search-wrap">
                  <input
                    value={workerSearchTerm}
                    onChange={(event) => setWorkerSearchTerm(event.target.value)}
                    placeholder="Search worker name or email"
                    aria-label="Search workers"
                  />
                </div>
                <div className="worker-filter-row">
                  <button
                    type="button"
                    className={workerStatusFilter === 'all' ? 'filter-pill active' : 'filter-pill'}
                    onClick={() => setWorkerStatusFilter('all')}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={workerStatusFilter === 'active' ? 'filter-pill active' : 'filter-pill'}
                    onClick={() => setWorkerStatusFilter('active')}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    className={workerStatusFilter === 'blocked' ? 'filter-pill active' : 'filter-pill'}
                    onClick={() => setWorkerStatusFilter('blocked')}
                  >
                    Blocked
                  </button>
                </div>
              </div>

              {showWorkerCreateModal ? (
                <div className="modal-backdrop" onClick={() => setShowWorkerCreateModal(false)}>
                  <div className="modal worker-modal" onClick={(event) => event.stopPropagation()}>
                    <h3>New worker profile</h3>
                    <form className="worker-create-form" onSubmit={handleCreateWorker}>
                      <label className="worker-field">
                        <span>Full name</span>
                        <input
                          value={workerForm.fullName}
                          onChange={(event) => {
                            const next = event.target.value;
                            const suggested = buildWorkerEmailFromName(next);
                            setWorkerForm((current) => ({
                              ...current,
                              fullName: next,
                              email: !current.email || current.email === buildWorkerEmailFromName(current.fullName) ? suggested : current.email,
                            }));
                          }}
                          placeholder="John Smith"
                          required
                        />
                      </label>

                      <label className="worker-field">
                        <span>Email</span>
                        <input
                          type="email"
                          value={workerForm.email}
                          onChange={(event) => setWorkerForm((current) => ({ ...current, email: event.target.value }))}
                          placeholder="johnsmith@gmail.com"
                          required
                        />
                      </label>

                      <label className="worker-field">
                        <span>Password</span>
                        <input
                          type="password"
                          value={workerForm.password}
                          onChange={(event) => setWorkerForm((current) => ({ ...current, password: event.target.value }))}
                          placeholder="Create a strong password"
                          required
                        />
                      </label>

                      <div className="worker-form-footer">
                        <small className="helper-text">Suggested email: {buildWorkerEmailFromName(workerForm.fullName) || 'Enter full name first'}</small>
                        <small className="helper-text strong-note">Password must include 8+ characters, uppercase, lowercase, and numbers.</small>
                        <div className="modal-actions compact-actions">
                          <button type="button" className="secondary-btn" onClick={() => setShowWorkerCreateModal(false)}>Cancel</button>
                          <button className="primary-btn" type="submit">Create worker</button>
                        </div>
                      </div>
                    </form>
                  </div>
                </div>
              ) : null}

              <div className="record-list worker-card-list">
                {filteredWorkers.length === 0 ? (
                  <div className="empty-employee-card">
                    <p className="empty-copy">No workers match this search or status.</p>
                  </div>
                ) : (
                  filteredWorkers.map((worker) => {
                    const isExpanded = expandedWorkerId === worker.id;
                    return (
                      <div
                        key={worker.id}
                        className={worker.blocked ? 'worker-card blocked' : 'worker-card'}
                        onClick={() => setExpandedWorkerId((current) => current === worker.id ? null : worker.id)}
                        onDoubleClick={() => setExpandedWorkerId((current) => current === worker.id ? null : worker.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setExpandedWorkerId((current) => current === worker.id ? null : worker.id);
                          }
                        }}
                      >
                          <div className="worker-card-top">
                            <div className="worker-avatar">{(worker.name || worker.email || 'W').charAt(0).toUpperCase()}</div>
                            <div className="worker-card-head">
                              <strong>{worker.name || worker.email}</strong>
                            </div>
                            <span className={worker.blocked ? 'status-chip blocked' : 'status-chip active'}>
                              {worker.blocked ? 'Blocked' : 'Active'}
                            </span>
                          </div>

                          {isExpanded ? (
                            <>
                              <div className="worker-meta-grid compact-meta-grid">
                                <div>
                                  <small>Email</small>
                                  <span>{worker.email}</span>
                                </div>
                                <div>
                                  <small>Password</small>
                                  <span>{worker.password || workerPasswords[worker.id || worker.email] || 'Assigned password'}</span>
                                </div>
                                <div>
                                  <small>Created</small>
                                  <span>{worker.createdAt ? new Date(worker.createdAt).toLocaleString() : 'Recent'}</span>
                                </div>
                                <div>
                                  <small>Access</small>
                                  <span>{worker.blocked ? 'Revoked' : 'Granted'}</span>
                                </div>
                              </div>

                              <div className="worker-card-actions">
                                <button
                                  type="button"
                                  className="secondary-btn compact-btn"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void copyWorkerDetail(getWorkerCredentialsText(worker), 'Credentials');
                                  }}
                                >
                                  Copy
                                </button>
                                <button
                                  type="button"
                                  className={worker.blocked ? 'secondary-btn compact-btn' : 'primary-btn compact-btn'}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setWorkerAccessModal({ open: true, worker, action: worker.blocked ? 'unblock' : 'block' });
                                  }}
                                >
                                  {worker.blocked ? 'Unblock' : 'Block'}
                                </button>
                                <button
                                  type="button"
                                  className="secondary-btn compact-btn"
                                  onClick={async (event) => {
                                    event.stopPropagation();
                                    const temp = `Tmp${Math.random().toString(36).slice(2, 9)}`;
                                    const authHeaders: HeadersInit = {
                                      'Content-Type': 'application/json',
                                      ...(token ? { Authorization: 'Bearer ' + token } : {}),
                                    };
                                    let apiOk = false;
                                    try {
                                      const resp = await fetch(`/api/users/${worker.id}/reset-password`, {
                                        method: 'POST',
                                        headers: authHeaders,
                                        body: JSON.stringify({ tempPassword: temp }),
                                      });
                                      if (resp.ok) {
                                        apiOk = true;
                                      } else {
                                        const p = await fetch(`/api/users/${worker.id}/password`, {
                                          method: 'PATCH',
                                          headers: authHeaders,
                                          body: JSON.stringify({ newPassword: temp }),
                                        });
                                        if (p.ok) apiOk = true;
                                      }
                                    } catch (error) {
                                      // ignore and fallback locally
                                    }

                                    if (apiOk) {
                                      try {
                                        await navigator.clipboard.writeText(temp);
                                        setToastMessage('Temporary password copied (server updated)');
                                      } catch (error) {
                                        setToastMessage('Password reset (server updated)');
                                      }
                                    } else {
                                      setWorkerPasswords((cur) => ({ ...cur, [worker.id || worker.email]: temp }));
                                      setToastMessage('Temp password generated (local only)');
                                    }

                                    const notif = {
                                      id: `notif-${Date.now()}`,
                                      title: 'Password reset',
                                      body: 'Your password was reset by admin. Check credentials.',
                                      read: false,
                                      createdAt: new Date().toISOString(),
                                      meta: { type: 'password-reset', userId: worker.id },
                                    };
                                    try {
                                      const nresp = await fetch('/api/notifications', {
                                        method: 'POST',
                                        headers: authHeaders,
                                        body: JSON.stringify(notif),
                                      });
                                      if (!nresp.ok) throw new Error('notif failed');
                                    } catch (error) {
                                      setData((cur) => ({ ...cur, notifications: [notif, ...(cur.notifications || [])] }));
                                    }
                                  }}
                                >
                                  Reset password
                                </button>
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Panel>
            <Panel eyebrow="Access rules" title="Staff management">
              <div className="analysis-card">
                <p>Blocked workers cannot sign in with their email and password until the admin restores access.</p>
                <ul className="bullet-list">
                  <li>Workers are created with their assigned email and password.</li>
                  <li>Each worker record shows their creation date and current status.</li>
                  <li>Only the admin can block or unblock a worker profile.</li>
                </ul>
              </div>
            </Panel>