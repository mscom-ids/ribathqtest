const fs = require('fs');
const file = 'src/app/admin/students/[id]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Fix status badge for active (the green dot stays green, the blue is for brand)
content = content.replace(
    "active:    { label: \"Active\",    dot: \"bg-emerald-500\", badge: \"bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400\" },",
    "active:    { label: \"Active\",    dot: \"bg-[#26af48]\", badge: \"bg-[#e6f7ec] text-[#26af48]\" },"
);

// Fix avatar (left panel) - blue background instead of gradient 
content = content.replace(
    "h-[88px] w-[88px] rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-4xl font-bold text-white shadow-md ring-4 ring-white dark:ring-[#1e2538]",
    "h-[88px] w-[88px] rounded-xl overflow-hidden bg-[#e8ebfd] flex items-center justify-center text-4xl font-bold text-[#3d5ee1]"
);

// Fix student ID color
content = content.replace(
    "text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5",
    "text-sm font-semibold text-[#3d5ee1] mt-0.5"
);

// Fix tab active color - emerald -> blue
content = content.split("'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'").join("'bg-[#e8ebfd] text-[#3d5ee1]'");

// Fix Save button
content = content.replace(
    'className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"',
    'className="bg-[#3d5ee1] hover:bg-[#3d5ee1]/90 text-white text-xs"'
);

// Fix Add Fees button
content = content.replace(
    "w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors shadow-sm",
    "w-full py-2.5 px-4 rounded-xl bg-[#3d5ee1] hover:bg-[#3d5ee1]/90 text-white text-sm font-semibold transition-colors"
);

// Fix edit profile button
content = content.replace(
    '"gap-1.5 text-xs bg-white dark:bg-transparent border-slate-200 dark:border-slate-600"',
    '"gap-1.5 text-xs bg-white border-[#3d5ee1] text-[#3d5ee1] hover:bg-[#e8ebfd]"'
);

fs.writeFileSync(file, content, 'utf8');
console.log('Done - colors updated!');
