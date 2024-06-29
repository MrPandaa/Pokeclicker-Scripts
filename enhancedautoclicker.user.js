// ==UserScript==
// @name          [Pokeclicker] Enhanced Auto Clicker
// @namespace     Pokeclicker Scripts
// @author        Optimatum (Original/Credit: Ephenia, Ivan Lay, Novie53, andrew951, Kaias26, kevingrillet, MrPandaa, VincentPS)
// @description   Clicks through battles, with adjustable speed, and provides various insightful statistics. Also includes an automatic gym battler and automatic dungeon explorer with multiple pathfinding modes.
// @copyright     https://github.com/Ephenia
// @license       GPL-3.0 License
// @version       3.5.4

// @homepageURL   https://github.com/Ephenia/Pokeclicker-Scripts/
// @supportURL    https://github.com/Ephenia/Pokeclicker-Scripts/issues
// @downloadURL   https://raw.githubusercontent.com/Ephenia/Pokeclicker-Scripts/master/enhancedautoclicker.user.js
// @updateURL     https://raw.githubusercontent.com/Ephenia/Pokeclicker-Scripts/master/enhancedautoclicker.user.js

// @match         https://www.pokeclicker.com/
// @icon          https://www.google.com/s2/favicons?domain=pokeclicker.com
// @grant         unsafeWindow
// @run-at        document-idle
// ==/UserScript==

class EnhancedAutoClicker {
    // Constants
    static ticksPerSecond = 20;
    static maxClickMultiplier = 5;
    // Auto Clicker
    static autoClickState = ko.observable(validateStorage('autoClickState', false));
    static autoClickMultiplier = validateStorage('autoClickMultiplier', 1, (v) => (Number.isInteger(v) && v >= 1));
    static autoClickerLoop;
    // Auto Gym
    static autoGymState = ko.observable(validateStorage('autoGymState', false));
    static autoGymSelect = validateStorage('autoGymSelect', 0, [0, 1, 2, 3, 4]);
    // Auto Dungeon
    static autoDungeonState = ko.observable(validateStorage('autoDungeonState', false));
    static autoDungeonFinishBeforeStopping = validateStorage('autoDungeonFinishBeforeStopping', true);
    static autoDungeonEncounterMode = validateStorage('autoDungeonEncounterMode', false);
    static autoDungeonChestMode = validateStorage('autoDungeonChestMode', false);
    static autoDungeonLootTier = validateStorage('autoDungeonLootTier', 0, [...Object.keys(baseLootTierChance).keys()]);
    static autoDungeonAlwaysOpenRareChests = validateStorage('autoDungeonAlwaysOpenRareChests', false);
    static autoDungeonTracker = {
        ID: 0,
        floor: null,
        floorSize: null,
        flashTier: null,
        flashCols: null,
        coords: null,
        bossCoords: null,
        encounterCoords: null,
        chestCoords: null,
        floorExplored: false,
        floorFinished: false,
        dungeonFinished: false,
        stopAfterFinishing: false,
    };

    //auto Achievement
    static autoAchievementSelectTypes = {Routes: 0, Gyms: 1, Dungeons: 2};
    static autoAchievementState = ko.observable(validateStorage('autoAchievementState', false));
    static autoAchievementSelect = ko.observable(validateStorage('autoAchievementSelect', 0, [...Object.keys(this.autoAchievementSelectTypes)]));

    // Clicker statistics calculator
    static autoClickCalcLoop;
    static autoClickCalcEfficiencyDisplayMode = validateStorage('autoClickCalcEfficiencyDisplayMode', 0, [0, 1]);
    static autoClickCalcDamageDisplayMode = validateStorage('autoClickCalcDamageDisplayMode', 0, [0, 1]);
    static autoClickCalcTracker = {
        lastUpdate: null,
        playerState: -1,
        playerLocation: null,
        ticks: null,
        clicks: null,
        enemies: null,
        areaHealth: null,
    };
    // Visual settings
    static gymGraphicsDisabled = ko.observable(validateStorage('gymGraphicsDisabled', false));
    static dungeonGraphicsDisabled = ko.observable(validateStorage('dungeonGraphicsDisabled', false));
    // Computed observables for visual settings
    static autoGymOn = ko.pureComputed(() => {
        return this.autoClickState() && this.autoGymState();
    });
    static disableAutoGymGraphics = ko.pureComputed(() => {
        return this.gymGraphicsDisabled() && this.autoGymOn();
    });
    static disableAutoDungeonGraphics = ko.pureComputed(() => {
        return this.dungeonGraphicsDisabled() && this.autoClickState() && this.autoDungeonState();
    });

    /* Initialization */

    static initOverrides() {
        // Add data bindings immediately, before the game initializes Knockout
        this.addGraphicsBindings();

        // Override static class methods
        this.overrideGymRunner();
        this.overrideDungeonRunner();
    }

    static toggleAutoAchievement(event) {
        const element = event.target;
        this.autoAchievementState(!this.autoAchievementState());
        this.autoAchievementState()
            ? element.classList.replace('btn-danger', 'btn-success')
            : element.classList.replace('btn-success', 'btn-danger');
        element.textContent = `Auto Achievement [${
            this.autoAchievementState() ? 'ON' : 'OFF'
        }]`;
        localStorage.setItem('autoAchievementState', this.autoAchievementState());

        // Deactivate AutoGym and AutoDungeon that could have been triggered
        if (this.autoGymState() === true) {
            document.getElementById('auto-gym-start').click();
        }

        if (this.autoDungeonState() === true) {
            document.getElementById('auto-dungeon-start').click();
        }
    }

    static changeSelectedAchievement(event) {
        // Deactivate AutoGym and AutoDungeon that could have been triggered
        if (this.autoGymState() === true) {
            document.getElementById('auto-gym-start').click();
        }

        if (this.autoDungeonState() === true) {
            document.getElementById('auto-dungeon-start').click();
        }

        const element = event.target;
        if (this.autoAchievementSelect() != +element.value) {
            this.autoAchievementSelect(+element.value);
            localStorage.setItem(
                'autoAchievementSelect',
                this.autoAchievementSelect()
            );
            document.getElementById('auto-achievement-start').click();
            document.getElementById('auto-achievement-start').click();
        }
    }

    static initAutoClicker() {
        const battleView = document.getElementsByClassName('battle-view')[0];

        var elemAC = document.createElement("table");
        elemAC.innerHTML = `<tbody>
        <tr>
            <td colspan="4">
                <button id="auto-click-start" class="btn btn-${this.autoClickState() ? 'success' : 'danger'} btn-block" style="font-size:8pt;">
                    Auto Click [${this.autoClickState() ? 'ON' : 'OFF'}]<br />
                    <div id="auto-click-info">
                        <!-- calculator display will be set by resetCalculator() -->
                    </div>
                </button>
                <div id="click-rate-cont">
                    <div id="auto-click-rate-info">
                        Click Attack Rate: ${(this.ticksPerSecond * this.autoClickMultiplier).toLocaleString('en-US', {maximumFractionDigits: 2})}/s
                    </div>
                    <input id="auto-click-rate" type="range" min="1" max="${this.maxClickMultiplier}" value="${this.autoClickMultiplier}">
                </div>
            </td>
        </tr>
        <tr>
            <td style="display: flex; column-gap: 2px;">
                <div style="flex: auto;">
                    <button id="auto-dungeon-start" class="btn btn-block btn-${this.autoDungeonState() ? 'success' : 'danger'}" style="font-size: 8pt;">
                        Auto Dungeon [${this.autoDungeonState() ? 'ON' : 'OFF'}]
                    </button>
                </div>
                <div id="auto-dungeon-encounter-mode" style="flex: initial; max-height: 30px; max-width: 30px; padding: 2px;">
                    <img title="Auto Dungeon fights mode" src="assets/images/dungeons/encounter.png" height="100%" style="${this.autoDungeonEncounterMode ? '' : 'filter: grayscale(100%);'}" />
                </div>
                <div id="auto-dungeon-chest-mode" style="flex: initial; max-height: 30px; max-width: 40px; padding: 2px;">
                    <img title="Auto Dungeon chest mode" src="assets/images/dungeons/chest.png" height="100%" style="${this.autoDungeonChestMode ? '' : 'filter: grayscale(100%)'}" />
                </div>
                <div style="flex: initial; display: flex; flex-direction: column;">
                    <div id="auto-dungeon-loottier" class="dropdown show">
                        <button type="button" class="text-left custom-select col-12 btn btn-dropdown" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" style="max-height:30px; display:flex; flex:1; align-items:center;">
                            <img id="auto-dungeon-loottier-img" src="assets/images/dungeons/chest-${Object.keys(baseLootTierChance)[this.autoDungeonLootTier]}.png" style="height:100%;">
                        </button>
                        <div id="auto-dungeon-loottier-dropdown" class="border-secondary dropdown-menu col-12">
                            ${Object.keys(baseLootTierChance).map((tier, i) => `<div class="dropdown-item" value="${i}"><img src="assets/images/dungeons/chest-${tier}.png"></div>` ).join('\n')}
                        </div>
                    </div>
                </div>
                <div style="flex: auto;">
                    <button id="auto-gym-start" class="btn btn-block btn-${this.autoGymState() ? 'success' : 'danger'}" style="font-size: 8pt;">
                        Auto Gym [${this.autoGymState() ? 'ON' : 'OFF'}]
                    </button>
                </div>
                <div style="flex: initial; display: flex; flex-direction: column;">
                    <select id="auto-gym-select" value="${this.autoGymSelect}" style="flex: auto;">
                        <option value="0">#1</option>
                        <option value="1">#2</option>
                        <option value="2">#3</option>
                        <option value="3">#4</option>
                        <option value="4">#5</option>
                    </select>
                </div>
            </td>
        </tr>
        <tr>
            <td style="display: flex; column-gap: 2px;">
                <div style="flex: auto;">
                    <button id="auto-achievement-start" class="btn btn-block btn-${this.autoAchievementState() ? 'success' : 'danger'}" style="font-size: 8pt;">
                        Auto Achievement [${this.autoAchievementState() ? 'ON' : 'OFF'}]
                    </button>
                </div>
                <div style="flex: initial; display: flex; flex-direction: column;">
                    <select id="achievement-select">
                        <option value = "0">Routes</option>
                        <option value = "1">Gyms</option>
                        <option value = "2">Dungeons</option>
                    </select>
                </div>
            </td>
        </tr>
    </tbody>`;
        battleView.before(elemAC);
        this.resetCalculator(); // initializes calculator display

        const settingsBody = createScriptSettingsContainer('Enhanced Auto Clicker');
        const settingsToAdd = [];

        // Dropdowns
        let dropdownsToAdd = [
            ['autoClickCalcEfficiencyDisplayMode', 'Auto Clicker efficiency display mode', this.autoClickCalcEfficiencyDisplayMode, ['Percentage', 'Ticks/s']],
            ['autoClickCalcDamageDisplayMode', 'Auto Clicker damage display mode', this.autoClickCalcDamageDisplayMode, ['Click Attacks', 'Damage']]
        ];
        dropdownsToAdd.forEach(([name, text, value, options]) => {
            const newSetting = document.createElement('tr')
            settingsToAdd.push(newSetting);
            newSetting.innerHTML = `<td class="p-2 col-md-8">
                ${text}
                </td>
                <td class="p-0 col-md-4">
                <select id="select-${name}" class="form-control" value="${value}">
                ${options.map((desc, val) => `<option value="${val}">${desc}</option>`).join('\n')}
                </select>
                </td>`;
        });
        // Checkboxes
        let checkboxesToAdd = [
            ['autoDungeonFinishBeforeStopping', 'Auto Dungeon finishes dungeons before turning off', this.autoDungeonFinishBeforeStopping],
            ['autoDungeonAlwaysOpenRareChests', 'Always open visible targeted chests', this.autoDungeonAlwaysOpenRareChests],
            ['autoGymGraphicsDisabled', 'Disable Auto Gym graphics', this.gymGraphicsDisabled()],
            ['autoDungeonGraphicsDisabled', 'Disable Auto Dungeon graphics', this.dungeonGraphicsDisabled()]
        ];
        checkboxesToAdd.forEach(([name, text, isChecked]) => {
            const newSetting = document.createElement('tr')
            settingsToAdd.push(newSetting);
            newSetting.innerHTML = `<td class="p-2 col-md-8">
                <label class="m-0" for="checkbox-${name}">${text}</label>
                </td><td class="p-2 col-md-4">
                <input id="checkbox-${name}" type="checkbox">
                </td>`;
            newSetting.querySelector(`#checkbox-${name}`).checked = isChecked;
        });

        settingsBody.append(...settingsToAdd);

        document.getElementById('achievement-select').value = this.autoAchievementSelect();
        document.getElementById('auto-achievement-start').addEventListener('click', (event) => {this.toggleAutoAchievement(event);});
        document.getElementById('achievement-select').addEventListener('change', (event) => {this.changeSelectedAchievement(event);});
        document.getElementById('auto-gym-select').value = this.autoGymSelect;
        document.getElementById('auto-click-start').addEventListener('click', () => { EnhancedAutoClicker.toggleAutoClick(); });
        document.getElementById('auto-click-rate').addEventListener('change', (event) => { EnhancedAutoClicker.changeClickMultiplier(event); });
        document.getElementById('auto-gym-start').addEventListener('click', () => { EnhancedAutoClicker.toggleAutoGym(); });
        document.getElementById('auto-gym-select').addEventListener('change', (event) => { EnhancedAutoClicker.changeSelectedGym(event); });
        document.getElementById('auto-dungeon-start').addEventListener('click', () => { EnhancedAutoClicker.toggleAutoDungeon(true); });
        document.getElementById('auto-dungeon-encounter-mode').addEventListener('click', () => { EnhancedAutoClicker.toggleAutoDungeonEncounterMode(); });
        document.getElementById('auto-dungeon-chest-mode').addEventListener('click', () => { EnhancedAutoClicker.toggleAutoDungeonChestMode(); });
        document.getElementById('checkbox-autoDungeonFinishBeforeStopping').addEventListener('change', () => { EnhancedAutoClicker.toggleAutoDungeonFinishBeforeStopping(); });
        document.getElementById('checkbox-autoDungeonAlwaysOpenRareChests').addEventListener('change', () => { EnhancedAutoClicker.toggleAutoDungeonAlwaysOpenRareChests(); });
        document.getElementById('checkbox-autoGymGraphicsDisabled').addEventListener('change', () => { EnhancedAutoClicker.toggleAutoGymGraphics(); });
        document.getElementById('checkbox-autoDungeonGraphicsDisabled').addEventListener('change', () => { EnhancedAutoClicker.toggleAutoDungeonGraphics(); });
        document.getElementById('select-autoClickCalcEfficiencyDisplayMode').addEventListener('change', (event) => { EnhancedAutoClicker.changeCalcEfficiencyDisplayMode(event); });
        document.getElementById('select-autoClickCalcDamageDisplayMode').addEventListener('change', (event) => { EnhancedAutoClicker.changeCalcDamageDisplayMode(event); });

        document.querySelectorAll('#auto-dungeon-loottier-dropdown > div').forEach((elem) => {
            elem.addEventListener('click', () => { EnhancedAutoClicker.changeAutoDungeonLootTier(elem.getAttribute('value')); });
        });

        addGlobalStyle('#auto-click-info { display: flex; flex-direction: row; justify-content: center; }');
        addGlobalStyle('#auto-click-info > div { width: 33.3%; }');
        addGlobalStyle('#click-rate-cont { display: flex; flex-direction: column; align-items: stretch; }');
        addGlobalStyle('#auto-dungeon-loottier-dropdown img { max-height: 30px; width: auto; }');

        if (this.autoClickState()) {
            this.toggleAutoClickerLoop();
        }
    }

    /**
     * Add extra Knockout data bindings to optionally disable (most) gym and dungeon graphics
     */
    static addGraphicsBindings() {
        // Add gymView data bindings
        var gymContainer = document.querySelector('div[data-bind="if: App.game.gameState === GameConstants.GameState.gym"]');
        var elemsToBind = ['knockout[data-bind*="pokemonNameTemplate"]', // Pokemon name
            'span[data-bind*="pokemonsDefeatedComputable"]', // Gym Pokemon counter (pt 1)
            'span[data-bind*="pokemonsUndefeatedComputable"]', // Gym Pokemon counter (pt 2)
            'knockout[data-bind*="pokemonSpriteTemplate"]', // Pokemon sprite
            'div.progress.hitpoints', // Pokemon healthbar
            'div.progress.timer' // Gym timer
            ];
        elemsToBind.forEach((query) => {
            var elem = gymContainer.querySelector(query);
            if (elem) {
                elem.before(new Comment("ko ifnot: EnhancedAutoClicker.disableAutoGymGraphics()"));
                elem.after(new Comment("/ko"));
            }
        });
        // Always hide stop button during autoGym, even with graphics enabled
        var restartButton = gymContainer.querySelector('button[data-bind="visible: GymRunner.autoRestart()"]');
        restartButton.setAttribute('data-bind', 'visible: GymRunner.autoRestart() && !EnhancedAutoClicker.autoGymOn()');

        // Add dungeonView data bindings
        var dungeonContainer = document.querySelector('div[data-bind="if: App.game.gameState === GameConstants.GameState.dungeon"]');
        // Title bar contents
        dungeonContainer.querySelector('h2.pageItemTitle')?.prepend(new Comment("ko ifnot: EnhancedAutoClicker.disableAutoDungeonGraphics()"));
        dungeonContainer.querySelector('h2.pageItemTitle')?.append(new Comment("/ko"));
        // Main container sprites etc
        dungeonContainer.querySelector('h2.pageItemTitle')?.after(new Comment("ko ifnot: EnhancedAutoClicker.disableAutoDungeonGraphics()"));
        dungeonContainer.querySelector('h2.pageItemFooter')?.before(new Comment("/ko"));
    }

    /* Settings event handlers */

    static toggleAutoClick() {
        const element = document.getElementById('auto-click-start');
        this.autoClickState(!this.autoClickState());
        localStorage.setItem('autoClickState', this.autoClickState());
        this.autoClickState() ? element.classList.replace('btn-danger', 'btn-success') : element.classList.replace('btn-success', 'btn-danger');
        if (!this.autoClickState()) {
            if (this.autoGymState()) {
                this.toggleAutoGym();
            }
            if (this.autoDungeonState()) {
                this.toggleAutoDungeon();
            }
        }

        this.toggleAutoClickerLoop();
    }

    static changeClickMultiplier(event) {
        // TODO decide on a better range / function
        const multiplier = +event.target.value;
        if (Number.isInteger(multiplier) && multiplier > 0) {
            this.autoClickMultiplier = multiplier;
            localStorage.setItem("autoClickMultiplier", this.autoClickMultiplier);
            var displayNum = (this.ticksPerSecond * this.autoClickMultiplier).toLocaleString('en-US', {maximumFractionDigits: 2});
            document.getElementById('auto-click-rate-info').innerText = `Click Attack Rate: ${displayNum}/s`;
            this.toggleAutoClickerLoop();
        }
    }

    static toggleAutoGym() {
        const element = document.getElementById('auto-gym-start');
        const newState = !this.autoGymState();
        if (newState && !this.canStartAutoGym()) {
            // Don't turn on if there's no gym here
            return;
        } else if (newState && this.autoDungeonState()) {
            // Only one mode may be active at a time
            return;
        }
        this.autoGymState(newState);
        localStorage.setItem('autoGymState', this.autoGymState());
        this.autoGymState() ? element.classList.replace('btn-danger', 'btn-success') : element.classList.replace('btn-success', 'btn-danger');
        element.textContent = `Auto Gym [${this.autoGymState() ? 'ON' : 'OFF'}]`;
        if (this.autoGymState()) {
            if (!this.autoClickState()) {
                // Turn on the auto clicker if necessary
                this.toggleAutoClick();
            }
        } else {
            // Assume we can't reach this point with only the built-in auto restart running, so it's safe to stop it
            GymRunner.autoRestart(false);
        }
    }

    static changeSelectedGym(event) {
        const val = +event.target.value;
        if ([0, 1, 2, 3, 4].includes(val)) {
            this.autoGymSelect = val;
            localStorage.setItem("autoGymSelect", this.autoGymSelect);
            // In case currently fighting a gym
            if (this.autoClickState() && this.autoGymState()) {
                // Only break out of this script's auto restart, not the built-in one
                GymRunner.autoRestart(false);
            }
        }
    }

    static toggleAutoDungeon(allowSlowStop = false) {
        const element = document.getElementById('auto-dungeon-start');
        let newState = !this.autoDungeonState();

        if (DungeonGuides.hired()) {
            // Auto Dungeon can't run alongside dungeon guides, force stop
            newState = false;
            allowSlowStop = false;
            Notifier.notify({
                type: NotificationConstants.NotificationOption.warning,
                title: 'Enhanced Auto Clicker',
                message: `Auto Dungeon mode is not compatible with Dungeon Guides.`,
                timeout: GameConstants.SECOND * 15,
            });
        } else if (newState && !this.canStartAutoDungeon()) {
            // Don't turn on if there's no dungeon here
            return;
        } else if (newState && this.autoGymState()) {
            // Only one mode may be active at a time
            return;
        }

        localStorage.setItem('autoDungeonState', newState);

        if (allowSlowStop && this.autoDungeonFinishBeforeStopping && App.game.gameState === GameConstants.GameState.dungeon &&
            (!newState && !this.autoDungeonTracker.stopAfterFinishing)) {
            // Instead of stopping immediately, wait and exit after beating this dungeon
            this.autoDungeonTracker.stopAfterFinishing = true;
        } else {
            this.autoDungeonState(newState);
            this.autoDungeonTracker.stopAfterFinishing = false;
        }
        element.classList.remove('btn-success', 'btn-danger', 'btn-warning');
        element.classList.add(this.autoDungeonTracker.stopAfterFinishing ? 'btn-warning' : (newState ? 'btn-success' : 'btn-danger'));
        element.textContent = `Auto Dungeon [${newState ? 'ON' : 'OFF'}]`;

        if (newState) {
            // Trigger a dungeon scan
            this.autoDungeonTracker.ID = -1;
            if (!this.autoClickState()) {
                // Turn on the auto clicker if necessary
                this.toggleAutoClick();
            }
        }
    }

    static toggleAutoDungeonEncounterMode() {
        this.autoDungeonEncounterMode = !this.autoDungeonEncounterMode;
        $('#auto-dungeon-encounter-mode img').css('filter', `${this.autoDungeonEncounterMode ? '' : 'grayscale(100%)' }`);
        localStorage.setItem('autoDungeonEncounterMode', this.autoDungeonEncounterMode);
        this.autoDungeonTracker.coords = null;
    }

    static toggleAutoDungeonChestMode() {
        this.autoDungeonChestMode = !this.autoDungeonChestMode;
        $('#auto-dungeon-chest-mode img').css('filter', `${this.autoDungeonChestMode ? '' : 'grayscale(100%)' }`);
        localStorage.setItem('autoDungeonChestMode', this.autoDungeonChestMode);
        this.autoDungeonTracker.coords = null;
    }

    static changeAutoDungeonLootTier(tier) {
        const val = +tier;
        if ([...Object.keys(baseLootTierChance).keys()].includes(val)) {
            this.autoDungeonLootTier = val;
            document.getElementById('auto-dungeon-loottier-img').setAttribute('src', `assets/images/dungeons/chest-${Object.keys(baseLootTierChance)[val]}.png`);
            localStorage.setItem("autoDungeonLootTier", this.autoDungeonLootTier);
        }
    }

    static toggleAutoDungeonFinishBeforeStopping() {
        this.autoDungeonFinishBeforeStopping = !this.autoDungeonFinishBeforeStopping;
        if (!this.autoDungeonFinishBeforeStopping && this.autoDungeonTracker.stopAfterFinishing) {
            this.toggleAutoDungeon();
        }
        localStorage.setItem('autoDungeonFinishBeforeStopping', this.autoDungeonFinishBeforeStopping);
    }

    static toggleAutoDungeonAlwaysOpenRareChests() {
        this.autoDungeonAlwaysOpenRareChests = !this.autoDungeonAlwaysOpenRareChests;
        localStorage.setItem('autoDungeonAlwaysOpenRareChests', this.autoDungeonAlwaysOpenRareChests);
    }

    static toggleAutoGymGraphics() {
        this.gymGraphicsDisabled(!this.gymGraphicsDisabled());
        localStorage.setItem('gymGraphicsDisabled', this.gymGraphicsDisabled());
    }

    static toggleAutoDungeonGraphics() {
        this.dungeonGraphicsDisabled(!this.dungeonGraphicsDisabled());
        localStorage.setItem('dungeonGraphicsDisabled', this.dungeonGraphicsDisabled());
    }

    static changeCalcEfficiencyDisplayMode(event) {
        const val = +event.target.value;
        if (val != this.autoClickCalcEfficiencyDisplayMode && [0, 1].includes(val)) {
            this.autoClickCalcEfficiencyDisplayMode = val;
            localStorage.setItem('autoClickCalcEfficiencyDisplayMode', this.autoClickCalcEfficiencyDisplayMode);
            this.resetCalculator();
        }
    }

    static changeCalcDamageDisplayMode(event) {
        const val = +event.target.value;
        if (val != this.autoClickCalcDamageDisplayMode && [0, 1].includes(val)) {
            this.autoClickCalcDamageDisplayMode = val;
            localStorage.setItem('autoClickCalcDamageDisplayMode', this.autoClickCalcDamageDisplayMode);
            this.resetCalculator();
        }
    }

    /* Auto Clicker */

    /**
     * Resets and, if enabled, restarts autoclicker
     * -While enabled, runs <ticksPerSecond> times per second in active battle
     */
    static toggleAutoClickerLoop() {
        var delay = Math.ceil(1000 / this.ticksPerSecond);
        clearInterval(this.autoClickerLoop);
        // Restart stats calculator
        this.resetCalculator();
        // Only use click multiplier while autoclicking
        this.overrideClickAttack(this.autoClickState() ? this.autoClickMultiplier : 1);
        if (this.autoClickState()) {
            // Start autoclicker loop
            this.autoClickerLoop = setInterval(() => EnhancedAutoClicker.autoClicker(), delay);
        } else {
            if (this.autoGymState()) {
                GymRunner.autoRestart(false);
            }
        }
    }

    /**
     * One tick of the autoclicker
     * -Performs click attacks while in an active battle
     * -Outside of battle, runs Auto Dungeon and Auto Gym
     */
    static autoClicker() {
        // Click while in a normal battle
        if (App.game.gameState === GameConstants.GameState.fighting) {
            Battle.clickAttack(this.autoClickMultiplier);
        }
        // ...or gym battle
        else if (App.game.gameState === GameConstants.GameState.gym) {
            GymBattle.clickAttack(this.autoClickMultiplier);
        }
        // ...or dungeon battle
        else if (App.game.gameState === GameConstants.GameState.dungeon && DungeonRunner.fighting()) {
            DungeonBattle.clickAttack(this.autoClickMultiplier);
        }
        // ...or temporary battle
        else if (App.game.gameState === GameConstants.GameState.temporaryBattle) {
            TemporaryBattleBattle.clickAttack(this.autoClickMultiplier);
        }
        // If not battling, progress through dungeon
        else if (this.autoDungeonState()) {
            this.autoDungeon();
        }
        // If not battling gym, start battling
        else if (this.autoGymState()) {
            this.autoGym();
        }
        if (this.autoAchievementState()) {
            this.autoAchievement();
        }
        this.autoClickCalcTracker.ticks[0]++;
    }

    static autoAchievement() {
        try {
            let currentRoute = player.route;
            let currentRegion = player.region;
            let currentDungeon = player.town.dungeon?.name;
            let currentGym = player.town.name;

            // can't do anything if we're catching a pokemon
            if (App.game.gameState === GameConstants.GameState.dungeon && DungeonBattle.catching()) {
                return;
            }

            if (this.autoAchievementSelect() === this.autoAchievementSelectTypes.Routes) {
                let newRoute = this.getNextRoute();
                if (!newRoute) {
                    return;
                }
                currentRoute = player.route;
                if (
                    (newRoute && newRoute.number !== currentRoute) ||
                    newRoute.region !== currentRegion
                ) {
                    if (newRoute.region !== player.subregion) {
                        if (newRoute.subRegion === undefined) {
                            player.subregion = 0;
                        } else {
                            player.subregion = newRoute.subRegion;
                        }
                    }
                    MapHelper.moveToRoute(newRoute.number, newRoute.region);
                }
            } else if (this.autoAchievementSelect() === this.autoAchievementSelectTypes.Gyms) {
                //move
                let gymNumber = 0;
                let newGym = this.getNextGym();
                let town = TownList[newGym];
                if (!newGym) {
                    return;
                }

                if (town === undefined) {
                    let tempTown = Array.from(Object.entries(TownList)).find((val) =>
                        val[1].content.find((val2) => val2.town === newGym)
                    );
                    let gyms = tempTown[1].content.filter((val) => val instanceof Gym);
                    gymNumber = gyms.findIndex((val) => val.town === newGym);
                    newGym = tempTown[0];
                    town = TownList[newGym];
                }
                if (this.autoGymSelect !== gymNumber) {
                    this.autoGymSelect = gymNumber;
                    document.getElementById('auto-gym-select').value = gymNumber;
                    EnhancedAutoClicker.toggleAutoGym();
                }

                if (!MapHelper.isTownCurrentLocation(currentGym)) {
                    MapHelper.moveToTown(currentGym);
                }
                if (newGym && newGym !== currentGym) {
                    currentGym = newGym;
                    if (town.subRegion === undefined) {
                        player.subregion = 0;
                    } else {
                        player.subregion = town.subRegion;
                    }
                    player.subregion = town.subRegion;
                    MapHelper.moveToTown(newGym);
                }
                //Toggle Auto Gym ON
                if (this.autoGymState() === false) {
                    EnhancedAutoClicker.toggleAutoGym();
                }
            } else if (this.autoAchievementSelect() === this.autoAchievementSelectTypes.Dungeons) {
                //Move
                let newDungeon = this.getNextDungeon();
                if (!newDungeon) {
                    return;
                }
                if (!MapHelper.isTownCurrentLocation(currentDungeon)) {
                    MapHelper.moveToTown(newDungeon);
                }
                if (newDungeon && newDungeon !== currentDungeon) {
                    player.subregion = TownList[newDungeon].subRegion;
                    DungeonRunner.dungeonFinished(true);
                    DungeonRunner.fighting(false);
                    DungeonRunner.fightingBoss(false);
                    MapHelper.moveToTown(newDungeon);
                }
                //Toggle Auto Dungeon ON
                if (this.autoDungeonState() === false) {
                    document.getElementById('auto-dungeon-start').click();
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    static getNextRoute() {
        let regionRoutes = Routes.getRoutesByRegion(player.region);
        for (const region of regionRoutes) {
            if (
                this.getDefeatedOnRoute(player.region, region.number) <
                GameConstants.ACHIEVEMENT_DEFEAT_ROUTE_VALUES[
                GameConstants.ACHIEVEMENT_DEFEAT_ROUTE_VALUES.length - 1
                    ]
            ) {
                return region;
            }
        }
        player.region++;
        return false;
    }

    static getNextGym() {
        let gyms = Array.from(Object.values(GymList));
        let regionGyms = gyms
            .filter((val) => val.parent)
            .sort((a, b) => {
                Math.max(...a.pokemons.map((val) => val.baseHealth)) -
                Math.max(...b.pokemons.map((val) => val.baseHealth));
            });
        for (let j = 0; j < regionGyms.length; j++) {
            if (
                this.getDefeatedOnGym(regionGyms[j].town) <
                GameConstants.ACHIEVEMENT_DEFEAT_GYM_VALUES[
                GameConstants.ACHIEVEMENT_DEFEAT_GYM_VALUES.length - 1
                    ]
            ) {
                if (player.reqion !== regionGyms[j].parent.region) {
                    player.region = regionGyms[j].parent.region;
                }
                return regionGyms[j].town;
            }
        }
    }

    static getNextDungeon() {
        let regionDungeons = GameConstants.RegionDungeons[player.region];
        for (let j = 0; j < regionDungeons.length; j++) {
            if (
                this.getDefeatedOnDungeon(regionDungeons[j]) <
                GameConstants.ACHIEVEMENT_DEFEAT_DUNGEON_VALUES[
                GameConstants.ACHIEVEMENT_DEFEAT_DUNGEON_VALUES.length - 1
                    ]
            ) {
                return regionDungeons[j];
            }
        }
        player.region++;
        return false;
    }

    static getDefeatedOnRoute(region, route) {
        return App.game.statistics.routeKills[region][route]();
    }

    static getDefeatedOnGym(gymName) {
        return App.game.statistics.gymsDefeated[
            GameConstants.getGymIndex(gymName)
            ]();
    }

    static getDefeatedOnDungeon(dungeonName) {
        return App.game.statistics.dungeonsCleared[
            GameConstants.getDungeonIndex(dungeonName)
            ]();
    }

    /**
     * Override the game's function for Click Attack to:
     * - make multiple clicks at once via multiplier
     * - support changing the attack speed cap for higher tick speeds
     */
    static overrideClickAttack(clickMultiplier = 1) {
        // Set delay based on the autoclicker's tick rate
        // (lower to give setInterval some wiggle room)
        const delay = Math.min(Math.ceil(1000 / this.ticksPerSecond) - 10, 50);
        Battle.clickAttack = function () {
            // click attacks disabled and we already beat the starter
            if (App.game.challenges.list.disableClickAttack.active() && player.regionStarters[GameConstants.Region.kanto]() != GameConstants.Starter.None) {
                return;
            }
            const now = Date.now();
            if (this.lastClickAttack > now - delay) {
                return;
            }
            if (!this.enemyPokemon()?.isAlive()) {
                return;
            }
            this.lastClickAttack = now;
            // Don't autoclick more than needed for lethal
            const clickDamage = App.game.party.calculateClickAttack(true);
            var clicks = Math.min(clickMultiplier, Math.ceil(this.enemyPokemon().health() / clickDamage));
            GameHelper.incrementObservable(App.game.statistics.clickAttacks, clicks);
            this.enemyPokemon().damage(clickDamage * clicks);
            if (!this.enemyPokemon().isAlive()) {
                this.defeatPokemon();
            }
        }
    }


    /* Auto Gym */

    /**
     * Starts selected gym with auto restart enabled
     */
    static autoGym() {
        if (this.canStartAutoGym()) {
            // Find all unlocked gyms in the current town
            var gymList = player.town.content.filter((c) => (c.constructor.name == "Gym" && c.isUnlocked()));
            if (gymList.length > 0) {
                var gymIndex = Math.min(this.autoGymSelect, gymList.length - 1);
                // Start in auto restart mode
                GymRunner.startGym(gymList[gymIndex], true);
                return;
            }
        }
        // Disable if we aren't in a location with unlocked gyms
        this.toggleAutoGym();
    }

    static canStartAutoGym() {
        return App.game.gameState === GameConstants.GameState.gym || (App.game.gameState === GameConstants.GameState.town &&
            player.town.content.some((c) => c.constructor.name == "Gym" && c.isUnlocked())
        );
    }

    /**
     * Override GymRunner built-in functions:
     * -Add auto gym equivalent of gymWon() to save on performance by not loading town between
     */
    static overrideGymRunner() {
        GymRunner.gymWonNormal = GymRunner.gymWon;
        // Version with free auto restart
        GymRunner.gymWonAuto = function(gym) {
            if (GymRunner.running()) {
                GymRunner.running(false);
                // First time defeating this gym
                if (!App.game.badgeCase.hasBadge(gym.badgeReward)) {
                    gym.firstWinReward();
                }
                GameHelper.incrementObservable(App.game.statistics.gymsDefeated[GameConstants.getGymIndex(gym.town)]);
                // Award money for defeating gym as we're auto clicking
                App.game.wallet.gainMoney(gym.moneyReward);

                if (GymRunner.autoRestart()) {
                    // Unlike the original function, autoclicker doesn't charge the player money
                    GymRunner.startGym(GymRunner.gymObservable(), GymRunner.autoRestart(), false);
                    return;
                }

                // Send the player back to the town they were in
                player.town = gym.parent;
                App.game.gameState = GameConstants.GameState.town;
            }
        }
        // Only use our version when auto gym is running
        GymRunner.gymWon = function(...args) {
            if (EnhancedAutoClicker.autoClickState() && EnhancedAutoClicker.autoGymState()) {
                GymRunner.gymWonAuto(...args);
            } else {
                GymRunner.gymWonNormal(...args);
            }
        }
    }

    /* Auto Dungeon */

    /**
     * Automatically begins and progresses through dungeons with multiple pathfinding options
     */
    static autoDungeon() { // TODO more thoroughly test switching between modes and enabling/disabling within a dungeon
        // Progress through dungeon
        if (App.game.gameState === GameConstants.GameState.dungeon) {
            if (DungeonRunner.fighting() || DungeonBattle.catching()) {
                // Can't do anything while in a battle
                return;
            }
            // Scan each new dungeon floor
            if (this.autoDungeonTracker.ID !== DungeonRunner.dungeonID || this.autoDungeonTracker.floor !== DungeonRunner.map.playerPosition().floor) {
                this.scanDungeon();
            }
            // If boss has been defeated, wait for the dungeon restart (delayed to allow quest updates)
            if (this.autoDungeonTracker.dungeonFinished) {
                return;
            }
            // Reset pathfinding coordinates to entrance
            if (this.autoDungeonTracker.coords == null) {
                this.autoDungeonTracker.coords = new Point(Math.floor(this.autoDungeonTracker.floorSize / 2), this.autoDungeonTracker.floorSize - 1, this.autoDungeonTracker.floor);
            }
            const floorMap = DungeonRunner.map.board()[this.autoDungeonTracker.floor];

            // All targets visible, fight enemies / open chests then finish floor
            if (floorMap[this.autoDungeonTracker.bossCoords.y][this.autoDungeonTracker.bossCoords.x].isVisible &&
                !((this.autoDungeonChestMode || this.autoDungeonEncounterMode) && !this.autoDungeonTracker.floorExplored)) {
                this.clearDungeon();
            }
            // Explore dungeon to reveal boss + any target tiles
            else {
                this.exploreDungeon();
            }
        }
        // Begin dungeon
        else if (this.canStartAutoDungeon()) {
            // Enter dungeon if unlocked and affordable
            DungeonRunner.initializeDungeon(player.town.dungeon);
        } else {
            // Disable if locked, can't afford entry cost, or there's no dungeon here
            this.toggleAutoDungeon();
        }
    }

    static canStartAutoDungeon() {
        if (!(App.game.gameState === GameConstants.GameState.dungeon || (App.game.gameState === GameConstants.GameState.town && player.town instanceof DungeonTown))) {
            return false;
        }
        if (DungeonGuides.hired()) {
            return false;
        }
        const dungeon = player.town.dungeon;
        return dungeon?.isUnlocked() && App.game.wallet.hasAmount(new Amount(dungeon.tokenCost, GameConstants.Currency.dungeonToken));
    }

    /**
     * Scans current dungeon floor for relevant locations and pathfinding data
     */
    static scanDungeon() {
        // Reset / update tracker values
        this.autoDungeonTracker.ID = DungeonRunner.dungeonID;
        this.autoDungeonTracker.floor = DungeonRunner.map.playerPosition().floor;
        this.autoDungeonTracker.floorSize = DungeonRunner.map.floorSizes[DungeonRunner.map.playerPosition().floor];
        this.autoDungeonTracker.encounterCoords = [];
        this.autoDungeonTracker.chestCoords = [];
        this.autoDungeonTracker.coords = null;
        this.autoDungeonTracker.targetCoords = null;
        this.autoDungeonTracker.floorExplored = false;
        this.autoDungeonTracker.floorFinished = false;
        this.autoDungeonTracker.dungeonFinished = false;

        // Scan for chest and boss coordinates
        var dungeonBoard = DungeonRunner.map.board()[this.autoDungeonTracker.floor];
        for (var y = 0; y < dungeonBoard.length; y++) {
            for (var x = 0; x < dungeonBoard[y].length; x++) {
                let tile = dungeonBoard[y][x];
                if (tile.type() == GameConstants.DungeonTileType.enemy) {
                    this.autoDungeonTracker.encounterCoords.push(new Point(x, y, this.autoDungeonTracker.floor));
                } else if (tile.type() == GameConstants.DungeonTileType.chest) {
                    let lootTier = Object.keys(baseLootTierChance).indexOf(tile.metadata.tier);
                    this.autoDungeonTracker.chestCoords.push({'xy': new Point(x, y, this.autoDungeonTracker.floor), 'tier': lootTier});
                } else if (tile.type() == GameConstants.DungeonTileType.boss || tile.type() == GameConstants.DungeonTileType.ladder) {
                    this.autoDungeonTracker.bossCoords = new Point(x, y, this.autoDungeonTracker.floor);
                }
            }
        }
        // Sort chests by descending rarity
        this.autoDungeonTracker.chestCoords.sort((a, b) => b.tier - a.tier);

        // TODO find a more future-proof way to get flash distance
        this.autoDungeonTracker.flashTier = DungeonFlash.tiers.findIndex(tier => tier === DungeonRunner.map.flash);
        this.autoDungeonTracker.flashCols = [];
        let flashRadius = DungeonRunner.map.flash?.playerOffset[0] ?? 0;
        // Calculate minimum columns to fully reveal dungeon with Flash
        if (flashRadius > 0) {
            let cols = new Set();
            cols.add(flashRadius);
            let i = this.autoDungeonTracker.floorSize - flashRadius - 1;
            while (i > flashRadius) {
                cols.add(i);
                i -= flashRadius * 2 + 1;
            }
            this.autoDungeonTracker.flashCols = [...cols].sort();
        }
    }

    /**
     * Explores dungeon to reveal tiles, skipping columns that can be efficiently revealed by Flash
     */
    static exploreDungeon() {
        const dungeonBoard = DungeonRunner.map.board()[this.autoDungeonTracker.floor];
        var hasMoved = false;
        var stuckInLoopCounter = 0;
        while (!hasMoved) {
            // End of column
            if (this.autoDungeonTracker.coords.y == 0) {
                if (this.autoDungeonTracker.coords.x <= 0 || this.autoDungeonTracker.coords.x === this.autoDungeonTracker.flashCols[0]) {
                    // Done exploring, clearDungeon() will take over from here
                    this.autoDungeonTracker.floorExplored = true;
                    return;
                }
                // Move to start of next column
                this.autoDungeonTracker.coords.y = this.autoDungeonTracker.floorSize - 1;
                if (this.autoDungeonTracker.coords.x >= this.autoDungeonTracker.floorSize - 1 || this.autoDungeonTracker.coords.x === this.autoDungeonTracker.flashCols.at(-1)) {
                    // Done with this side, move to other side of the entrance
                    this.autoDungeonTracker.coords.x = Math.floor(this.autoDungeonTracker.floorSize / 2) - 1;
                } else {
                    // Move away from the entrance
                    this.autoDungeonTracker.coords.x += (this.autoDungeonTracker.coords.x >= Math.floor(this.autoDungeonTracker.floorSize / 2) ? 1 : -1);
                }
            // Dungeon has Flash unlocked, skip columns not in optimal flash pathing
            } else if (this.autoDungeonTracker.flashTier > -1
                && this.autoDungeonTracker.coords.y == (this.autoDungeonTracker.floorSize - 1)
                && !this.autoDungeonTracker.flashCols.includes(this.autoDungeonTracker.coords.x)) {
                // Move one column further from the entrance
                this.autoDungeonTracker.coords.x += (this.autoDungeonTracker.coords.x >= Math.floor(this.autoDungeonTracker.floorSize / 2) ? 1 : -1);
            }
            // Move through current column
            else {
                this.autoDungeonTracker.coords.y -= 1;
            }
            // One move per tick to look more natural
            if (!dungeonBoard[this.autoDungeonTracker.coords.y][this.autoDungeonTracker.coords.x].isVisited) {
                DungeonRunner.map.moveToCoordinates(this.autoDungeonTracker.coords.x, this.autoDungeonTracker.coords.y);
                hasMoved = true;
            }
            stuckInLoopCounter++;
            if (stuckInLoopCounter > 100) {
                console.warn(`Auto Dungeon got stuck in a loop while moving to tile \'${GameConstants.DungeonTileType[dungeonBoard[this.autoDungeonTracker.targetCoords.y][this.autoDungeonTracker.targetCoords.x].type()]}\' (${this.autoDungeonTracker.targetCoords.x}, ${this.autoDungeonTracker.targetCoords.y})`);
                this.toggleAutoDungeon();
                return;
            }
        }
    }

    /**
     * Clears dungeon, visiting all desired tile types. Assumes dungeon has already been explored to reveal desired tiles.
     */
    static clearDungeon() {
        const dungeonBoard = DungeonRunner.map.board()[this.autoDungeonTracker.floor];
        var hasMoved = false;
        var stuckInLoopCounter = 0;
        while (!hasMoved) {
            // Choose a tile to move towards
            if (!this.autoDungeonTracker.targetCoords) {
                this.autoDungeonTracker.targetCoords = this.chooseDungeonTargetTile();
            }
            this.autoDungeonTracker.coords = this.pathfindTowardDungeonTarget();
            if (!this.autoDungeonTracker.coords) {
                console.warn(`Auto Dungeon could not find path to target tile \'${GameConstants.DungeonTileType[dungeonBoard[this.autoDungeonTracker.targetCoords.y][this.autoDungeonTracker.targetCoords.x].type()]}\' (${this.autoDungeonTracker.targetCoords.x}, ${this.autoDungeonTracker.targetCoords.y})`);
                this.toggleAutoDungeon();
                return;
            }
            // One move per tick to look more natural
            if (!(dungeonBoard[this.autoDungeonTracker.coords.y][this.autoDungeonTracker.coords.x] === DungeonRunner.map.currentTile())) {
                DungeonRunner.map.moveToCoordinates(this.autoDungeonTracker.coords.x, this.autoDungeonTracker.coords.y);
                hasMoved = true;
            }
            // Target tile reached
            if (this.autoDungeonTracker.coords.x === this.autoDungeonTracker.targetCoords.x && this.autoDungeonTracker.coords.y === this.autoDungeonTracker.targetCoords.y) {
                this.autoDungeonTracker.targetCoords = null;
                hasMoved = true;
                // Take corresponding action
                const tileType = DungeonRunner.map.currentTile().type();
                if (tileType === GameConstants.DungeonTileType.enemy) {
                    // Do nothing, fights begin automatically
                } else if (tileType === GameConstants.DungeonTileType.chest) {
                    DungeonRunner.openChest();
                } else if (tileType === GameConstants.DungeonTileType.boss) {
                    if (this.autoDungeonTracker.floorFinished) {
                        DungeonRunner.startBossFight();
                    }
                } else if (tileType === GameConstants.DungeonTileType.ladder) {
                    if (this.autoDungeonTracker.floorFinished) {
                        DungeonRunner.nextFloor();
                    }
                } else {
                    console.warn(`Auto Dungeon targeted tile type ${GameConstants.DungeonTileType[tileType]}`);
                }
            }
            stuckInLoopCounter++;
            if (stuckInLoopCounter > 5) {
                console.warn(`Auto Dungeon got stuck in a loop while moving to tile \'${GameConstants.DungeonTileType[dungeonBoard[this.autoDungeonTracker.targetCoords.y][this.autoDungeonTracker.targetCoords.x].type()]}\' (${this.autoDungeonTracker.targetCoords.x}, ${this.autoDungeonTracker.targetCoords.y})`);
                this.toggleAutoDungeon();
                return;
            }
        }
    }

    /**
     * Chooses a target tile based on auto dungeon modes and dungeon progress
     */
    static chooseDungeonTargetTile() {
        const dungeonBoard = DungeonRunner.map.board()[this.autoDungeonTracker.floor];
        let target = null;
        while (!target) {
            // Boss tile not yet unlocked
            if (!dungeonBoard[this.autoDungeonTracker.bossCoords.y][this.autoDungeonTracker.bossCoords.x].isVisited) {
                target = this.autoDungeonTracker.bossCoords;
            }
            // Encounters to fight
            else if (this.autoDungeonEncounterMode && this.autoDungeonTracker.encounterCoords.length) {
                // Skip already-fought encounters
                let encounter = this.autoDungeonTracker.encounterCoords.pop();
                if (dungeonBoard[encounter.y][encounter.x].type() == GameConstants.DungeonTileType.enemy) {
                    target = encounter;
                } else {
                    continue;
                }
            }
            // Chests to open
            else if (this.autoDungeonChestMode && this.autoDungeonTracker.chestCoords.length && this.autoDungeonTracker.chestCoords[0].tier >= this.autoDungeonLootTier) {
                target = this.autoDungeonTracker.chestCoords.shift().xy;
            }
            // Open visible chests of sufficient rarity
            else if (this.autoDungeonAlwaysOpenRareChests && this.autoDungeonTracker.chestCoords.some((c) => c.tier >= this.autoDungeonLootTier && dungeonBoard[c.xy.y][c.xy.x].isVisible)) {
                let index = this.autoDungeonTracker.chestCoords.findIndex((c) => c.tier >= this.autoDungeonLootTier && dungeonBoard[c.xy.y][c.xy.x].isVisible);
                target = this.autoDungeonTracker.chestCoords[index].xy;
                this.autoDungeonTracker.chestCoords.splice(index, 1);
            }
            // Time to fight the boss
            else {
                target = this.autoDungeonTracker.bossCoords;
                this.autoDungeonTracker.floorFinished = true;
            }
        }
        return target;
    }

    /**
     * Find next tile on the shortest path towards target via breadth-first search
     */
    static pathfindTowardDungeonTarget() {
        const target = this.autoDungeonTracker.targetCoords;
        let result = null;
        if (!target) {
            return result;
        }
        const queue = [target];
        const visited = new Set(`${target.x}-${target.y}`);
        while (queue.length) {
            const p = queue.shift();
            if (DungeonRunner.map.hasAccessToTile(p)) {
                result = p;
                break;
            }
            const adjTiles = [[p.x - 1, p.y], [p.x + 1, p.y], [p.x, p.y - 1], [p.x, p.y + 1]];
            for (let [nx, ny] of adjTiles) {
                // Enqueue valid tiles not yet considered
                let xy = `${nx}-${ny}`;
                if (0 <= nx && nx < this.autoDungeonTracker.floorSize && 0 <= ny && ny < this.autoDungeonTracker.floorSize && !visited.has(xy)) {
                    queue.push(new Point(nx, ny, target.floor));
                    visited.add(xy);
                }
            }
        }
        return result;
    }

    /**
     * Restart dungeon, separate from dungeonWon function so it can be called with a delay
     */
    static restartDungeon() {
        if (App.game.gameState !== GameConstants.GameState.dungeon) {
            return;
        } else if (!EnhancedAutoClicker.canStartAutoDungeon()) {
            MapHelper.moveToTown(DungeonRunner.dungeon.name);
            return;
        }
        this.autoDungeonTracker.dungeonFinished = false;

        // Clear old board to force map visuals refresh
        DungeonRunner.map.board([]);
        DungeonRunner.initializeDungeon(DungeonRunner.dungeon);
    }

    /**
     * Override DungeonRunner built-in functions:
     * -Add dungeon ID tracking to initializeDungeon() for easier mapping
     * -Add auto dungeon equivalent of dungeonWon() to save on performance by restarting without loading town
     */
    static overrideDungeonRunner() {
        // Differentiate between dungeons for mapping
        DungeonRunner.dungeonID = 0;
        const oldInit = DungeonRunner.initializeDungeon.bind(DungeonRunner);
        DungeonRunner.initializeDungeon = function (...args) {
            DungeonRunner.dungeonID++;
            return oldInit(...args);
        }

        DungeonRunner.dungeonWonNormal = DungeonRunner.dungeonWon;
        // Version with integrated auto-restart to avoid loading town in between dungeons
        DungeonRunner.dungeonWonAuto = function () {
            if (!DungeonRunner.dungeonFinished()) {
                DungeonRunner.dungeonFinished(true);
                // First time clearing dungeon
                if (!App.game.statistics.dungeonsCleared[GameConstants.getDungeonIndex(DungeonRunner.dungeon.name)]()) {
                    DungeonRunner.dungeon.rewardFunction();
                }
                GameHelper.incrementObservable(App.game.statistics.dungeonsCleared[GameConstants.getDungeonIndex(DungeonRunner.dungeon.name)]);

                if (EnhancedAutoClicker.autoDungeonTracker.stopAfterFinishing) {
                    EnhancedAutoClicker.toggleAutoDungeon();
                }

                if (EnhancedAutoClicker.autoDungeonState() && EnhancedAutoClicker.canStartAutoDungeon()) {
                    // Restart the dungeon with a delay, giving Defeat Dungeon Boss quests time to update
                    EnhancedAutoClicker.autoDungeonTracker.dungeonFinished = true;
                    setTimeout(() => EnhancedAutoClicker.restartDungeon(), 50);
                } else {
                    if (!DungeonRunner.hasEnoughTokens()) {
                        // Notify player if they've run out of tokens
                        Notifier.notify({
                            type: NotificationConstants.NotificationOption.warning,
                            title: 'Enhanced Auto Clicker',
                            message: `Auto Dungeon mode ran out of dungeon tokens.`,
                            timeout: GameConstants.DAY,
                        });
                    }
                    if (EnhancedAutoClicker.autoDungeonState()) {
                        EnhancedAutoClicker.toggleAutoDungeon();
                    }
                    // Can't continue, exit auto dungeon mode
                    MapHelper.moveToTown(DungeonRunner.dungeon.name);
                }
            }
        }
        // Only use our version when auto dungeon is running
        DungeonRunner.dungeonWon = function (...args) {
            if (EnhancedAutoClicker.autoClickState() && EnhancedAutoClicker.autoDungeonState()) {
                DungeonRunner.dungeonWonAuto(...args);
            } else {
                DungeonRunner.dungeonWonNormal(...args);
            }
        }
    }

    /* Clicker statistics calculator */

    /**
     * Resets calculator loop, stats trackers, and calculator display
     * -If auto clicker is running, restarts calculator
     */
    static resetCalculator() {
        clearInterval(this.autoClickCalcLoop);
        this.autoClickCalcTracker.lastUpdate = [Date.now()];
        this.autoClickCalcTracker.ticks = [0];
        this.autoClickCalcTracker.clicks = [App.game.statistics.clickAttacks()];
        this.autoClickCalcTracker.enemies = [App.game.statistics.totalPokemonDefeated()];
        this.calculateAreaHealth();
        document.getElementById('auto-click-info').innerHTML = `<div>${this.autoClickCalcEfficiencyDisplayMode == 0 ? 'Clicker Efficiency' : 'Ticks/s'}:<br><div id="tick-efficiency" style="font-weight:bold;">-</div></div>
            <div>${this.autoClickCalcDamageDisplayMode == 0 ? 'Click Attacks/s' : 'DPS'}:<br><div id="clicks-per-second" style="font-weight:bold;">-</div></div>
            <div>Req. ${this.autoClickCalcDamageDisplayMode == 0 ? 'Clicks' : 'Click Damage'}:<br><div id="req-clicks" style="font-weight:bold;">-</div></div>
            <div>Enemies/s:<br><div id="enemies-per-second" style="font-weight:bold;">-</div></div>`;
        if (this.autoClickState()) {
            // Start calculator
            this.autoClickCalcLoop = setInterval(() => EnhancedAutoClicker.calcClickStats(), 1000);
        }
    }

    /**
     * Displays the following statistics, averaged over the last (up to) ten seconds:
     * -Percentage of ticksPerSecond the autoclicker is actually executing
     * -Clicks per second or damage per second, depending on display mode
     * -Required number of clicks or click attack damage to one-shot the current location, depending on display mode
     * --Ignores dungeon bosses and chest health increases
     * -Enemies defeated per second
     * Statistics are reset when the player changes locations
     */
    static calcClickStats() {
        if (this.hasPlayerMoved()) {
            // Reset statistics on area / game state change
            this.resetCalculator();
            return;
        }
        var elem;
        var clickDamage = App.game.party.calculateClickAttack(true);
        var actualElapsed = (Date.now() - this.autoClickCalcTracker.lastUpdate.at(-1)) / (1000 * this.autoClickCalcTracker.lastUpdate.length);

        // Percentage of maximum ticksPerSecond
        elem = document.getElementById('tick-efficiency');
        var avgTicks = this.autoClickCalcTracker.ticks.reduce((a, b) => a + b, 0) / this.autoClickCalcTracker.ticks.length;
        avgTicks = avgTicks / actualElapsed;
        if (this.autoClickCalcEfficiencyDisplayMode == 1) {
            // display ticks mode
            elem.innerHTML = avgTicks.toLocaleString('en-US', {maximumFractionDigits: 1} );
            elem.style.color = 'gold';
        } else {
            // display percentage mode
            var tickFraction = avgTicks / this.ticksPerSecond;
            elem.innerHTML = tickFraction.toLocaleString('en-US', {style: 'percent', maximumFractionDigits: 0} );
            elem.style.color = 'gold';
        }

        // Average clicks/damage per second
        elem = document.getElementById('clicks-per-second');
        var avgClicks = (App.game.statistics.clickAttacks() - this.autoClickCalcTracker.clicks.at(-1)) / this.autoClickCalcTracker.clicks.length;
        avgClicks = avgClicks / actualElapsed;
        if (this.autoClickCalcDamageDisplayMode == 1) {
            // display damage mode
            var avgDPS = avgClicks * clickDamage;
            elem.innerHTML = avgDPS.toLocaleString('en-US', {maximumFractionDigits: 0});
            elem.style.color = 'gold';
        } else {
            // display click attacks mode
            elem.innerHTML = avgClicks.toLocaleString('en-US', {maximumFractionDigits: 1});
            elem.style.color = 'gold';
        }

        // Required clicks/click damage
        elem = document.getElementById('req-clicks');
        if (this.autoClickCalcTracker.areaHealth == 0) {
            // can't meaningfully calculate a value for this area/game state
            elem.innerHTML = '-';
            elem.style.removeProperty('color');
        } else if (this.autoClickCalcDamageDisplayMode == 1) {
            // display damage mode
            var reqDamage = this.autoClickCalcTracker.areaHealth;
            elem.innerHTML = reqDamage.toLocaleString('en-US');
            elem.style.color = (clickDamage * this.autoClickMultiplier >= reqDamage ? 'greenyellow' : 'darkred');
        } else {
            // display clicks mode
            var reqClicks = Math.max((this.autoClickCalcTracker.areaHealth / clickDamage), 1);
            reqClicks = Math.ceil(reqClicks * 10) / 10; // round up to one decimal point
            elem.innerHTML = reqClicks.toLocaleString('en-US', {maximumFractionDigits: 1});
            elem.style.color = (reqClicks <= this.autoClickMultiplier ? 'greenyellow' : 'darkred');
        }

        // Enemies per second
        elem = document.getElementById('enemies-per-second');
        var avgEnemies = (App.game.statistics.totalPokemonDefeated() - this.autoClickCalcTracker.enemies.at(-1)) / this.autoClickCalcTracker.enemies.length;
        avgEnemies = avgEnemies / actualElapsed;
        elem.innerHTML = avgEnemies.toLocaleString('en-US', {maximumFractionDigits: 1});
        elem.style.color = 'gold';

        // Make room for next second's stats tracking
        // Add new entries to start of array for easier incrementing
        this.autoClickCalcTracker.ticks.unshift(0);
        if (this.autoClickCalcTracker.ticks.length > 10) {
            this.autoClickCalcTracker.ticks.pop();
        }
        this.autoClickCalcTracker.clicks.unshift(App.game.statistics.clickAttacks());
        if (this.autoClickCalcTracker.clicks.length > 10) {
            this.autoClickCalcTracker.clicks.pop();
        }
        this.autoClickCalcTracker.enemies.unshift(App.game.statistics.totalPokemonDefeated());
        if (this.autoClickCalcTracker.enemies.length > 10) {
            this.autoClickCalcTracker.enemies.pop();
        }
        this.autoClickCalcTracker.lastUpdate.unshift(Date.now());
        if (this.autoClickCalcTracker.lastUpdate.length > 10) {
            this.autoClickCalcTracker.lastUpdate.pop();
        }
    }

    /**
     * Check whether player state or location has changed
     */
    static hasPlayerMoved() {
        var moved = false;
        let newState = App.game.gameState;

        if (this.autoClickCalcTracker.playerState != newState) {
            this.autoClickCalcTracker.playerState = newState;
            moved = true;
        }
        let newLocation;
        if (App.game.gameState === GameConstants.GameState.gym) {
            newLocation = GymRunner.gymObservable().leaderName;
        } else if (App.game.gameState === GameConstants.GameState.dungeon) {
            newLocation = DungeonRunner.dungeon.name;
        } else if (App.game.gameState === GameConstants.GameState.temporaryBattle) {
            newLocation = TemporaryBattleRunner.battleObservable().name;
        } else {
            // Conveniently, player.route = 0 when not on a route
            newLocation = player.route || player.town.name;
        }
        if (this.autoClickCalcTracker.playerLocation != newLocation) {
            this.autoClickCalcTracker.playerLocation = newLocation;
            moved = true;
        }

        return moved;
    }

    /**
     * Calculate max Pokemon health for the current route/gym/dungeon
     * -Ignores dungeon boss HP and chest HP increases
     */
    static calculateAreaHealth() {
        // Calculate area max hp
        if (App.game.gameState === GameConstants.GameState.fighting) {
            this.autoClickCalcTracker.areaHealth = PokemonFactory.routeHealth(player.route, player.region);
            // Adjust for route health variation (adapted from PokemonFactory.generateWildPokemon)
            const pokeHP = [...new Set(Object.values(Routes.getRoute(player.region, player.route).pokemon).flat().flatMap(p => p.pokemon ?? p))].map(p => pokemonMap[p].base.hitpoints);
            const averageHP = pokeHP.reduce((s, a) => s + a, 0) / pokeHP.length;
            const highestHP = pokeHP.reduce((m, a) => Math.max(m, a), 0);
            this.autoClickCalcTracker.areaHealth = Math.round(this.autoClickCalcTracker.areaHealth * (0.9 + (highestHP / averageHP) / 10));
        } else if (App.game.gameState === GameConstants.GameState.gym) {
            // Get highest health gym pokemon
            this.autoClickCalcTracker.areaHealth = GymRunner.gymObservable().getPokemonList().reduce((a, b) => Math.max(a, b.maxHealth), 0);
        } else if (App.game.gameState === GameConstants.GameState.dungeon) {
            this.autoClickCalcTracker.areaHealth = DungeonRunner.dungeon.baseHealth;
        } else if (App.game.gameState === GameConstants.GameState.temporaryBattle) {
            // Get highest health trainer pokemon
            this.autoClickCalcTracker.areaHealth = TemporaryBattleRunner.battleObservable().getPokemonList().reduce((a, b) => Math.max(a, b.maxHealth), 0);
        } else {
            this.autoClickCalcTracker.areaHealth = 0;
        }
    }
}

/**
 * Loads variable from localStorage
 * -Returns value from localStorage if it exists, is correct type, and matches additional validation if provided
 * -Otherwise returns default value
 */
function validateStorage(key, defaultVal, allowed) {
    try {
        var val = localStorage.getItem(key);
        val = JSON.parse(val);
        if (val == null || typeof val !== typeof defaultVal || (typeof val == 'object' && val.constructor.name !== defaultVal.constructor.name)) {
            return defaultVal;
        }
        if (allowed != undefined) {
            if (Array.isArray(allowed) && !allowed.includes(val)) {
                return defaultVal;
            }
            if (allowed instanceof Function && !allowed(val)) {
                return defaultVal;
            }
        }
        return val;
    } catch {
        return defaultVal;
    }
}

/**
 * Creates container for scripts settings in the settings menu, adding scripts tab if it doesn't exist yet
 */
function createScriptSettingsContainer(name) {
    const settingsID = name.replaceAll(/s/g, '').toLowerCase();
    var settingsContainer = document.getElementById('settings-scripts-container');

    // Create scripts settings tab if it doesn't exist yet
    if (!settingsContainer) {
        // Fixes the Scripts nav item getting wrapped to the bottom by increasing the max width of the window
        document.querySelector('#settingsModal div').style.maxWidth = '850px';
        // Create and attach script settings tab link
        const settingTabs = document.querySelector('#settingsModal ul.nav-tabs');
        const li = document.createElement('li');
        li.classList.add('nav-item');
        li.innerHTML = `<a class="nav-link" href="#settings-scripts" data-toggle="tab">Scripts</a>`;
        settingTabs.appendChild(li);
        // Create and attach script settings tab contents
        const tabContent = document.querySelector('#settingsModal .tab-content');
        scriptSettings = document.createElement('div');
        scriptSettings.classList.add('tab-pane');
        scriptSettings.setAttribute('id', 'settings-scripts');
        tabContent.appendChild(scriptSettings);
        settingsContainer = document.createElement('div');
        settingsContainer.setAttribute('id', 'settings-scripts-container');
        scriptSettings.appendChild(settingsContainer);
    }

    // Create settings container
    const settingsTable = document.createElement('table');
    settingsTable.classList.add('table', 'table-striped', 'table-hover', 'm-0');
    const header = document.createElement('thead');
    header.innerHTML = `<tr><th colspan="2">${name}</th></tr>`;
    settingsTable.appendChild(header);
    const settingsBody = document.createElement('tbody');
    settingsBody.setAttribute('id', `settings-scripts-${settingsID}`);
    settingsTable.appendChild(settingsBody);

    // Insert settings container in alphabetical order
    let settingsList = Array.from(settingsContainer.children);
    let insertBefore = settingsList.find(elem => elem.querySelector('tbody').id > `settings-scripts-${settingsID}`);
    if (insertBefore) {
        insertBefore.before(settingsTable);
    } else {
        settingsContainer.appendChild(settingsTable);
    }

    return settingsBody;
}

function addGlobalStyle(css) {
    var head = document.getElementsByTagName('head')[0];
    if (!head) { return; }
    var style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = css;
    head.appendChild(style);
}

function loadEpheniaScript(scriptName, initFunction) {
    const windowObject = !App.isUsingClient ? unsafeWindow : window;
    // Inject handlers if they don't exist yet
    if (windowObject.epheniaScriptInitializers === undefined) {
        windowObject.epheniaScriptInitializers = {};
        const oldInit = Preload.hideSplashScreen;
        var hasInitialized = false;

        // Initializes scripts once enough of the game has loaded
        Preload.hideSplashScreen = function (...args) {
            var result = oldInit.apply(this, args);
            if (App.game && !hasInitialized) {
                // Initialize all attached userscripts
                Object.entries(windowObject.epheniaScriptInitializers).forEach(([scriptName, initFunction]) => {
                    try {
                        initFunction();
                    } catch (e) {
                        console.error(`Error while initializing '${scriptName}' userscript:\n${e}`);
                        Notifier.notify({
                            type: NotificationConstants.NotificationOption.warning,
                            title: scriptName,
                            message: `The '${scriptName}' userscript crashed while loading. Check for updates or disable the script, then restart the game.\n\nReport script issues to the script developer, not to the Pokéclicker team.`,
                            timeout: GameConstants.DAY,
                        });
                    }
                });
                hasInitialized = true;
            }
            return result;
        }
    }

    // Prevent issues with duplicate script names
    if (windowObject.epheniaScriptInitializers[scriptName] !== undefined) {
        console.warn(`Duplicate '${scriptName}' userscripts found!`);
        Notifier.notify({
            type: NotificationConstants.NotificationOption.warning,
            title: scriptName,
            message: `Duplicate '${scriptName}' userscripts detected. This could cause unpredictable behavior and is not recommended.`,
            timeout: GameConstants.DAY,
        });
        let number = 2;
        while (windowObject.epheniaScriptInitializers[`${scriptName} ${number}`] !== undefined) {
            number++;
        }
        scriptName = `${scriptName} ${number}`;
    }
    // Add initializer for this particular script
    windowObject.epheniaScriptInitializers[scriptName] = initFunction;
}

if (!App.isUsingClient || localStorage.getItem('enhancedautoclicker') === 'true') {
    if (!App.isUsingClient) {
        // Necessary for userscript managers
        unsafeWindow.EnhancedAutoClicker = EnhancedAutoClicker;
    }
    loadEpheniaScript('enhancedautoclicker', EnhancedAutoClicker.initAutoClicker.bind(EnhancedAutoClicker));
    $(document).ready(() => {
        EnhancedAutoClicker.initOverrides();
    });
}
