import { chromium } from 'playwright-core';

const BASE = process.env.QA_UI_BASE_URL || 'http://localhost:5173';
const results = [];
const check = (condition, name, detail = '') => {
  results.push({ ok: Boolean(condition), name, detail: condition ? '' : detail });
  if (!condition) console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
};

async function mockApi(page) {
  await page.route('http://localhost:5000/api/**', async route => {
    const url = route.request().url();
    const path = new URL(url).pathname;
    let body = { success: true };
    if (path.endsWith('/users/doctors')) body = { success:true, doctors:[{id:'doctor-1',name:'Dr QA',specialty:'Cardiology',experience:'8 years',location:'QA Clinic',fee:500}] };
    else if (path.endsWith('/appointments/mine')) body = { success:true, appointments:[
      {_id:'appointment-queue-1',doctor:'doctor-1',doctorName:'Dr QA',specialty:'Cardiology',location:'QA Clinic',appointmentDate:'2026-08-06',appointmentTime:'10:00',reason:'Follow-up',status:'Approved',queueNumber:7,queueStatus:'Waiting'},
      {_id:'appointment-done-1',doctor:'doctor-1',doctorName:'Dr QA',specialty:'Cardiology',location:'QA Clinic',appointmentDate:'2026-07-02',appointmentTime:'09:00',reason:'Check-up',status:'Completed',queueNumber:3,queueStatus:'Completed'},
    ] };
    else if (path.includes('/auth/register/request-otp')) body = { success:true, message:'A 6-digit verification code was sent to your email.', expiresAt:new Date(Date.now()+120000).toISOString() };
    else if (path.includes('/auth/register/verify-otp')) body = { success:true, message:'Email verified.', registrationToken:'qa-token' };
    else if (path.includes('/auth/register/complete')) body = { success:true, message:'Registration successful.', user:{name:'QA'} };
    else if (path.includes('/auth/password/forgot')) body = { success:true, message:'If an active account exists for this email, a verification code has been sent.', expiresAt:new Date(Date.now()+120000).toISOString() };
    else if (path.includes('/auth/password/verify-otp')) body = { success:true, message:'Email verified.', resetToken:'qa-reset-token' };
    else if (path.includes('/auth/password/reset')) body = { success:true, message:'Password updated successfully. You can now log in.' };
    else if (path.includes('/appointments/doctor/mine') || path.includes('/appointments/all')) body = { success:true, appointments:[] };
    else if (path.includes('/clinical/history/mine')) body = { success:true, records:[], prescriptions:[] };
    else if (path.includes('/payments/mine')) body = { success:true, payments:[] };
    else if (path.includes('/appointments/reports/summary')) body = { success:true, report:{byStatus:[],byDoctor:[],revenue:{total:0,count:0}} };
    else if (path.includes('/checkout')) body = { success:true, provider:'sslcommerz', checkoutUrl:'https://sandbox.sslcommerz.com/EasyCheckOut/qa' };
    else if (path.includes('/availability')) body = { success:true, date:'2026-08-26', timezone:'Asia/Dhaka', slots:[], next:{serial:2,time:'7:05 PM',of:24} };
    else if (path.includes('/users/me/availability')) body = { success:true, message:'Availability updated.', availability:{timezone:'Asia/Dhaka',slotDuration:45,weekly:Array.from({length:7},(_,day)=>({day,enabled:day>0&&day<6,start:'09:00',end:'17:00'})),unavailableDates:[],overrides:[]} };
    else if (path.includes('/auth/me')) body = { success:true, user:{name:'QA Doctor',email:'doctor@qa.test',role:'doctor',availability:{weekly:[],overrides:[]}} };
    else if (path.includes('/ai/conversations')) body = { success:true, conversations:[] };
    else if (path.includes('/ai/recommend')) body = { success:true, conversationId:'conv-1', title:'skin rash', source:'qa', urgent:false, specialty:'Dermatology', reply:'You should see a Dermatology doctor for a spreading rash.', recommendations:[{doctorId:'doctor-1',name:'Dr QA',specialty:'Dermatology',location:'QA Clinic',fee:500,date:'2026-08-24',day:'Monday',time:'9:00 AM',why:'Earliest dermatology slot.'}] };
    else if (path.includes('/notifications')) body = { success:true, notifications:[], unread:0 };
    else if (path.includes('/users/admin/stats')) body = { success:true, stats:{patients:2,doctors:2,receptionists:1,appointments:3} };
    else if (path.includes('/users/admin/users')) body = { success:true, users:[] };
    else if (path.includes('/users/admin/audit')) body = { success:true, logs:[] };
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(body) });
  });
}

async function run() {
  const browser = await chromium.launch({ executablePath:process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless:process.env.HEADED !== 'true', slowMo:Number(process.env.QA_SLOW_MO || 0), args:['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport:{width:1440,height:900} });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', message => { if (message.type()==='error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    await mockApi(page);

    await page.goto(BASE, { waitUntil:'networkidle' });
    check(await page.getByRole('heading',{name:/Healthcare that keeps/i}).isVisible(), 'Landing hero renders');
    check(await page.getByRole('link',{name:'Log in'}).first().isVisible(), 'Landing login link is visible');
    check(await page.getByRole('link',{name:'Get started'}).isVisible(), 'Landing registration link is visible');

    await page.goto(`${BASE}/login`, { waitUntil:'networkidle' });
    check(await page.getByRole('heading',{name:'Log in to DocFlow'}).isVisible(), 'Login form renders');
    check(await page.getByRole('link',{name:'Forgot password?'}).isVisible(), 'Forgot-password entry point is visible');
    await page.getByRole('link',{name:'Forgot password?'}).click();
    await page.waitForURL('**/forgot-password');
    await page.getByRole('heading',{name:'Forgot your password?'}).waitFor({state:'visible'});
    check(page.url().endsWith('/forgot-password') && await page.getByRole('heading',{name:'Forgot your password?'}).isVisible(), 'Forgot-password page opens');

    await page.goto(`${BASE}/register`);
    check(await page.getByRole('heading',{name:'Start with your email'}).isVisible(), 'Registration email step renders');
    await page.getByRole('textbox',{name:'Email address'}).fill('qa@example.com');
    await page.getByRole('button',{name:/Send verification code/}).click();
    await page.waitForURL('**/register/verify');
    await page.waitForTimeout(250);
    const registrationBody = await page.locator('body').innerText();
    check(await page.getByText(/Code expires in/).isVisible(), 'Registration OTP countdown renders', `${page.url()} — ${registrationBody.slice(0,240)}`);
    check(await page.getByRole('button',{name:'Resend OTP'}).isDisabled(), 'Registration resend is disabled before expiry', page.url());
    await page.getByLabel('Verification code').fill('123456');
    await page.getByRole('button',{name:/Verify email/}).click();
    await page.waitForURL('**/register/complete');
    await page.waitForTimeout(250);
    check(await page.getByRole('heading',{name:'Complete your profile'}).isVisible(), 'Registration profile step opens after verification', page.url());
    await page.getByLabel('Date of birth').fill('1995-04-10');
    check(await page.getByText(/Calculated age:/).isVisible(), 'DOB displays calculated age');

    await page.goto(`${BASE}/forgot-password`);
    await page.getByRole('textbox',{name:'Email address'}).fill('patient@example.com');
    await page.getByRole('button',{name:'Send reset code'}).click();
    await page.waitForURL('**/forgot-password/verify');
    await page.waitForTimeout(250);
    check(await page.getByText(/Code expires in/).isVisible(), 'Password-reset countdown renders');
    await page.getByLabel('Verification code').fill('654321');
    await page.getByRole('button',{name:'Verify code'}).click();
    await page.waitForURL('**/forgot-password/reset');
    await page.waitForTimeout(250);
    check(await page.getByRole('heading',{name:'Set a new password'}).isVisible(), 'New-password step opens after reset OTP');

    await page.addInitScript(() => { localStorage.setItem('token','qa-token'); localStorage.setItem('user',JSON.stringify({name:'QA Patient',email:'patient@qa.test',role:'patient'})); });
    await page.goto(`${BASE}/dashboard`, { waitUntil:'networkidle' });
    check(await page.getByText('DocFlow').first().isVisible(), 'Authenticated shell renders');
    check(await page.getByRole('navigation',{name:'Main navigation'}).isVisible(), 'Desktop sidebar renders');
    check(await page.locator('.app-topbar').isVisible(), 'Top bar renders');
    await page.getByRole('button',{name:'Collapse sidebar'}).click();
    check(await page.locator('.saas-header.collapsed').count()===1, 'Sidebar collapses');
    await page.getByRole('button',{name:'Expand sidebar'}).click();
    check(await page.locator('.saas-header.collapsed').count()===0, 'Sidebar expands');
    await page.getByRole('button',{name:/Use dark appearance/}).click();
    check(await page.locator('html.dark-mode').count()===1, 'Dark appearance activates');
    await page.locator('.topbar-profile').click();
    check(await page.getByText('QA Patient').last().isVisible(), 'Profile dropdown shows user name');
    check(await page.getByRole('link',{name:'View profile'}).isVisible(), 'Profile dropdown shows profile link');
    check(await page.getByRole('button',{name:'Log out'}).isVisible(), 'Profile dropdown shows logout');
    check(await page.locator('.profile-dropdown').getByText('Preferences').count()===0 && await page.locator('.profile-dropdown').getByText('Dashboard',{exact:true}).count()===0, 'Removed dropdown items stay absent');
    const themeSize = await page.getByRole('button',{name:/Use light appearance/}).evaluate(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height,svgW:el.querySelector('svg').getBoundingClientRect().width}));
    check(themeSize.w===28&&themeSize.h===28&&themeSize.svgW===14, 'Top-bar icon uses 28px container and 14px glyph', JSON.stringify(themeSize));

    check(await page.locator('.sidebar-nav').getByRole('link',{name:'Medical records'}).isVisible(), 'Patient sidebar exposes medical records');
    check(await page.locator('.sidebar-nav').getByRole('link',{name:'Messages'}).isVisible(), 'Patient sidebar exposes secure messages');
    check(await page.locator('.sidebar-nav').getByRole('link',{name:'Payments & calendar'}).count()===0, 'Payments and calendar is no longer in the patient sidebar');
    check(await page.locator('.sidebar-nav').getByRole('link',{name:'Live Queue',exact:true}).isVisible(), 'Patient sidebar exposes live queue');
    await page.goto(`${BASE}/live-queue`,{waitUntil:'networkidle'});
    check((await page.locator('.app-topbar h2').innerText()).trim()==='Live Queue', 'Live-queue selection workspace renders');
    check(await page.getByRole('link',{name:'Open live tracker'}).isVisible(), 'Approved queued appointment can open its live tracker');
    await page.goto(`${BASE}/my-appointments`,{waitUntil:'networkidle'});
    await page.waitForSelector('.tbl tbody tr');
    check((await page.locator('.tbl th').allInnerTexts()).map(t=>t.trim()).join('|')==='Doctor|Date and time|Queue|Payment|Status|Actions', 'Appointments render as a table, not cards');
    check(await page.locator('.tbl th').last().evaluate(el=>el.getBoundingClientRect().width>0&&el.querySelector('.sr-only').getBoundingClientRect().width<=1), 'Actions column keeps a screen-reader name but no visible label');
    check(await page.locator('main article').count()===0, 'No appointment card survives beside the table');
    const approvedRow = page.locator('.tbl tbody tr',{has:page.locator('.pill',{hasText:'Approved'})});
    const apptRow = (await approvedRow.innerText()).split(/\s+/).join(' ');
    check(apptRow.includes('Dr QA')&&apptRow.includes('#7')&&apptRow.includes('Approved'), 'Appointment row carries doctor, queue number and status', apptRow);
    check(apptRow.includes('Not paid')&&apptRow.includes('Cash'), 'Each appointment shows whether it is paid and how', apptRow);
    check(!apptRow.includes('Follow-up'), 'Reason column is gone from the table', apptRow);
    const doneMenu = page.locator('.tbl tbody tr',{has:page.locator('.pill',{hasText:'Completed'})}).locator('.rowmenu-button');
    check(await doneMenu.isDisabled(), 'A finished appointment shows a disabled dots button');
    check(await doneMenu.evaluate(el=>el.parentElement.getAttribute('title'))==='No action left', 'The disabled dots button explains itself on hover');
    check(await page.locator('.rowmenu-list').count()===0, 'Row actions stay hidden until the dots menu is opened');
    await approvedRow.locator('.rowmenu-button').click();
    check((await page.locator('.rowmenu-item').allInnerTexts()).map(t=>t.trim()).join('|')==='Live queue|Reschedule|Add to calendar|Cancel', 'Dots menu offers live queue, reschedule, calendar and cancel', (await page.locator('.rowmenu-item').allInnerTexts()).join('|'));
    await page.locator('.rowmenu-item',{hasText:'Reschedule'}).click();
    check(await page.locator('.rowmenu-list').count()===0, 'Choosing an action closes the dots menu');
    check(await page.locator('.tbl-edit td').getAttribute('colspan')==='6', 'Reschedule opens a row spanning the whole table');
    await page.goto(`${BASE}/book-appointment/doctor-1`,{waitUntil:'networkidle'});
    await page.waitForSelector('.serial');
    check((await page.locator('.serial').innerText()).includes('Choose a date'), 'Booking asks for a date before it can work out a serial', await page.locator('.serial').innerText());
    check(await page.getByRole('button',{name:/Confirm/}).isDisabled(), 'Booking cannot be confirmed without a serial');
    await page.locator('input[type=date]').fill('2026-08-26');
    await page.waitForTimeout(400);
    const serialCard=(await page.locator('.serial').innerText()).replace(/s+/g,' ');
    check(serialCard.includes('#2')&&serialCard.includes('7:05 PM'), 'Booking shows the serial and the time the system worked out', serialCard);
    check(await page.locator('form select').count()===1, 'The patient is not offered a time to pick', String(await page.locator('form select').count()));
    check(!(await page.getByRole('button',{name:/Confirm/}).isDisabled()), 'A date with a free place enables the booking');
    check(await page.locator('form textarea').count()===0, 'Booking does not ask the patient for a reason', String(await page.locator('form textarea').count()));
    check((await page.getByRole('button',{name:/Confirm/}).innerText()).trim()==='Confirm Appointment', 'A cash booking just confirms', await page.getByRole('button',{name:/Confirm/}).innerText());
    await page.selectOption('form select','online');
    await page.waitForTimeout(150);
    check((await page.getByRole('button',{name:/Confirm/}).innerText()).trim()==='Confirm and pay', 'Choosing online payment says the booking will go on to pay', await page.getByRole('button',{name:/Confirm/}).innerText());
    await page.goto(`${BASE}/medical-records`,{waitUntil:'networkidle'});
    check((await page.locator('.app-topbar h2').innerText()).trim()==='Medical Records', 'Medical-record workspace renders');
    await page.goto(`${BASE}/payments`,{waitUntil:'networkidle'});
    check((await page.locator('.app-topbar h2').innerText()).trim()==='Payments & Calendar', 'Payment and calendar workspace renders');
    await page.goto(`${BASE}/notification-settings`,{waitUntil:'networkidle'});
    check(await page.getByRole('heading',{name:'Reminder channels'}).isVisible(), 'Email and SMS preference workspace renders');

    await page.evaluate(()=>{localStorage.setItem('user',JSON.stringify({id:'doctor-1',name:'QA Doctor',email:'doctor@qa.test',role:'doctor'}));history.pushState({},'', '/clinical-workspace');dispatchEvent(new PopStateEvent('popstate'))});
    await page.waitForTimeout(300);
    check(await page.getByText('Select an appointment to document care.').isVisible(), 'Doctor clinical workspace renders', `${page.url()} — ${(await page.locator('body').innerText()).slice(0,300)}`);
    // A full navigation would re-run the init script and log back in as the patient.
    await page.evaluate(()=>{history.pushState({},'', '/availability');dispatchEvent(new PopStateEvent('popstate'))});
    await page.waitForSelector('.cons');
    const minutes = page.locator('.cons-minutes input');
    check(await page.locator('.cons .dd-button').count()===0, 'Consultation length is a plain minutes field, not a dropdown');
    check(await minutes.inputValue()==='30', 'Schedule page opens on the saved consultation length', await minutes.inputValue());
    check((await page.locator('.cons-hint').innerText()).includes('fits 16 patients'), 'Consultation length states how many patients a day fits', await page.locator('.cons-hint').innerText());
    await minutes.fill('15');
    await page.waitForTimeout(150);
    check((await page.locator('.cons-hint').innerText()).includes('fits 32 patients'), 'Halving the consultation length doubles the day capacity', await page.locator('.cons-hint').innerText());
    await minutes.fill('7');
    await page.waitForTimeout(150);
    check((await page.locator('.cons-hint').innerText()).includes('fits 68 patients at 7 minutes'), 'A consultation as short as a few minutes is accepted', await page.locator('.cons-hint').innerText());
    await minutes.fill('90');
    await page.waitForTimeout(150);
    check((await page.locator('.cons-hint').innerText()).includes('between 1 and 59')&&await minutes.getAttribute('aria-invalid')==='true', 'A length outside 1 to 59 minutes is refused', await page.locator('.cons-hint').innerText());
    await minutes.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(150);
    check(await minutes.inputValue()===''&&(await page.locator('.cons-hint').innerText()).includes('Type a whole number'), 'The minutes field can be cleared to type a new length', await minutes.inputValue());
    await page.keyboard.type('45');
    await page.waitForTimeout(150);
    check((await page.locator('.cons-hint').innerText()).includes('fits 10 patients at 45 minutes'), 'A length typed into the cleared field is taken', await page.locator('.cons-hint').innerText());
    await page.locator('.cons-label').click();
    await page.waitForTimeout(200);
    check(await minutes.inputValue()==='45', 'The typed length settles when the field is left', await minutes.inputValue());
    await minutes.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.locator('.cons-label').click();
    await page.waitForTimeout(200);
    check(await minutes.inputValue()==='45', 'A field left empty falls back to the length that was set', await minutes.inputValue());
    check(!(await page.locator('main').innerText()).includes('Availability updated'), 'The schedule page carries no confirmation banner');
    check(await page.locator('.sched-button').count()===2&&(await page.locator('.sched-head').allInnerTexts()).every(text=>text.includes('Save schedule')), 'Both schedule cards save from their own header', (await page.locator('.sched-head').allInnerTexts()).join(' | '));
    await page.locator('.sched-button').last().click();
    await page.waitForTimeout(250);
    check((await page.locator('.sched-button').last().innerText()).trim()==='Saved', 'The save button reports back instead of a banner', await page.locator('.sched-button').last().innerText());
    await page.evaluate(()=>{localStorage.setItem('user',JSON.stringify({id:'admin-1',name:'QA Admin',email:'admin@qa.test',role:'admin'}));history.pushState({},'', '/reports');dispatchEvent(new PopStateEvent('popstate'))});
    await page.waitForTimeout(300);
    check((await page.locator('.app-topbar h2').innerText()).trim()==='Reports', 'Admin reporting workspace renders', `${page.url()} — ${(await page.locator('body').innerText()).slice(0,120)}`);

    await page.evaluate(()=>{history.pushState({},'', '/admin-dashboard');dispatchEvent(new PopStateEvent('popstate'))});
    await page.waitForSelector('.wipe');
    check((await page.locator('.wipe-note').innerText()).includes('There is no undo'), 'The admin clear says plainly that it cannot be undone', await page.locator('.wipe-note').innerText());
    check(await page.locator('.wipe-button').isDisabled(), 'The clear button starts out of reach');
    await page.locator('.wipe-controls input').fill('delete all data');
    await page.waitForTimeout(150);
    check(await page.locator('.wipe-button').isDisabled(), 'A near-miss confirmation does not arm the clear');
    await page.locator('.wipe-controls input').fill('DELETE ALL DATA');
    await page.waitForTimeout(150);
    check(!(await page.locator('.wipe-button').isDisabled()), 'The exact phrase arms the clear');
    await page.locator('.wipe-controls input').fill('');
    await page.evaluate(()=>{localStorage.setItem('user',JSON.stringify({name:'QA Patient',email:'patient@qa.test',role:'patient'}));history.pushState({},'', '/ai-recommendation');dispatchEvent(new PopStateEvent('popstate'))});
    await page.waitForTimeout(300);
    await page.getByPlaceholder('Describe your symptoms...').fill('I have a skin rash');
    await page.getByRole('button',{name:'Send message'}).click();
    await page.waitForSelector('.doc-card',{timeout:15000});
    check((await page.locator('.doc-card').first().innerText()).includes('Dermatology'), 'Care assistant returns a bookable dermatology card', (await page.locator('.chat-scroll').innerText()).slice(0,200));
    check(await page.locator('.doc-card-book').first().isVisible(), 'Care assistant card offers a booking link');

    const mobile = await browser.newContext({ viewport:{width:390,height:844} });
    const mobilePage = await mobile.newPage(); await mockApi(mobilePage);
    await mobilePage.addInitScript(()=>{localStorage.setItem('token','qa-token');localStorage.setItem('user',JSON.stringify({name:'QA Patient',email:'patient@qa.test',role:'patient'}))});
    await mobilePage.goto(`${BASE}/dashboard`,{waitUntil:'networkidle'});
    check(await mobilePage.locator('.sidebar-mobile').isVisible(), 'Mobile authenticated header renders');
    await mobilePage.getByRole('button',{name:'Open menu'}).click();
    check(await mobilePage.getByRole('navigation',{name:'Mobile navigation'}).isVisible(), 'Mobile menu expands');
    const overflow = await mobilePage.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    check(overflow<=1, 'Mobile dashboard has no horizontal overflow', String(overflow));
    await mobilePage.goto(`${BASE}/login`,{waitUntil:'networkidle'});
    check(await mobilePage.getByRole('heading',{name:'Log in to DocFlow'}).isVisible(), 'Mobile login form remains visible');
    await mobile.close();

    check(consoleErrors.length===0, 'No browser console or page errors', consoleErrors.join(' | '));
    const passed=results.filter(item=>item.ok).length;const failed=results.filter(item=>!item.ok);
    console.log(`QA_UI_RESULT ${JSON.stringify({total:results.length,passed,failed:failed.length,failures:failed,consoleErrors})}`);
    if(failed.length)process.exitCode=1;
    await context.close();
  } finally { await browser.close(); }
}

run().catch(error=>{console.error('UI QA crashed:',error);process.exitCode=1});
