// src/scripts/assignDailyMissions.js
const supabase = require('../config/database'); 
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
async function assignDailyMissions() {
    console.log('Starting daily mission assignment...');
    const today = new Date().toISOString().slice(0, 10);

    try {
        const { data: allMissions, error: missionsError } = await supabase
            .from('missions')
            .select('id, type, required_completion_count, xp_reward, badge_reward'); 
        if (missionsError) throw missionsError;

        const generalMissions = allMissions.filter(m => m.type === 'watch_video' || m.type === 'complete_quiz'); 

        const selectedDailyMissions = generalMissions.sort(() => 0.5 - Math.random()).slice(0, 3); 

        if (selectedDailyMissions.length === 0) {
            console.log('No general missions available to assign. Exiting.');
            process.exit(0);
        }

        const { data: users, error: usersError } = await supabase.from('users').select('id'); 
        if (usersError) throw usersError;

        const inserts = [];
        for (const user of users) {
            for (const mission of selectedDailyMissions) {
                const { data: existingEntry, error: checkError } = await supabase
                    .from('daily_missions')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('mission_id', mission.id)
                    .eq('assigned_date', today)
                    .limit(1);

                if (checkError) console.error(`Error checking existing daily mission for user ${user.id}:`, checkError);

                if (!existingEntry || existingEntry.length === 0) {
                    inserts.push({
                        user_id: user.id,
                        mission_id: mission.id,
                        assigned_date: today,
                        current_progress: 0,
                        is_completed: false 
                    });
                }
            }
        }

        if (inserts.length > 0) {
            const { error: insertError } = await supabase.from('daily_missions').insert(inserts);
            if (insertError) throw insertError;
            console.log(`Successfully assigned ${inserts.length} new daily mission entries for ${today}.`);
        } else {
            console.log('No new daily missions to assign or all users already have missions for today.');
        }

    } catch (error) {
        console.error('Error assigning daily missions:', error);
    } finally {
        process.exit(0);
    }
}

assignDailyMissions();