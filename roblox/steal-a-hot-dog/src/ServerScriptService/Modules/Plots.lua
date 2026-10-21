--[[
	Plots
	Builds the map and owns everything about a player's base:
	pedestals, the deposit pad, the lock button and the shield.
--]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local HotDogData = require(ReplicatedStorage:WaitForChild("HotDogData"))

local Plots = {}

local PLOT_COUNT = 8
local PLOT_SIZE = 48
local WALL_HEIGHT = 14
local PEDESTAL_COUNT = 8

Plots.PedestalCount = PEDESTAL_COUNT
Plots.LockDuration = 20
Plots.LockCooldown = 45

local plots = {}
Plots.All = plots

-- Assigned by Main. Fired whenever the hot dogs standing on a plot change,
-- so the owner's sell panel can be refreshed.
Plots.OnChanged = function(_plot) end

local function newPart(props)
	local part = Instance.new("Part")
	part.Anchored = true
	part.Material = Enum.Material.SmoothPlastic
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth

	for key, value in pairs(props) do
		part[key] = value
	end

	return part
end

local function newLabel(parent, text, size, position, color, scaled)
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Size = size
	label.Position = position
	label.Font = Enum.Font.GothamBold
	label.Text = text
	label.TextColor3 = color
	label.TextScaled = scaled ~= false
	label.Parent = parent
	return label
end

local function buildSign(model, originCFrame)
	local board = newPart({
		Name = "Sign",
		Size = Vector3.new(30, 8, 1),
		CFrame = originCFrame * CFrame.new(0, WALL_HEIGHT + 5, PLOT_SIZE / 2),
		Color = Color3.fromRGB(22, 24, 32),
		Material = Enum.Material.SmoothPlastic,
	})
	board.Parent = model

	local surface = Instance.new("SurfaceGui")
	surface.Name = "Display"
	surface.Face = Enum.NormalId.Front
	surface.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	surface.PixelsPerStud = 32
	surface.LightInfluence = 0
	surface.Parent = board

	local owner = newLabel(
		surface,
		"OPEN BASE",
		UDim2.fromScale(1, 0.52),
		UDim2.fromScale(0, 0.04),
		Color3.fromRGB(255, 255, 255)
	)
	owner.Name = "Owner"

	local income = newLabel(
		surface,
		"$0 / sec",
		UDim2.fromScale(1, 0.34),
		UDim2.fromScale(0, 0.58),
		Color3.fromRGB(120, 230, 140)
	)
	income.Name = "Income"

	return owner, income
end

local function buildPlot(index, originCFrame)
	local model = Instance.new("Model")
	model.Name = string.format("Plot%d", index)

	local floor = newPart({
		Name = "Floor",
		Size = Vector3.new(PLOT_SIZE, 1, PLOT_SIZE),
		CFrame = originCFrame,
		Color = Color3.fromRGB(62, 70, 86),
		Material = Enum.Material.Concrete,
	})
	floor.Parent = model

	local trim = newPart({
		Name = "Trim",
		Size = Vector3.new(PLOT_SIZE + 3, 0.7, PLOT_SIZE + 3),
		CFrame = originCFrame * CFrame.new(0, -0.45, 0),
		Color = Color3.fromRGB(255, 176, 60),
		Material = Enum.Material.Neon,
	})
	trim.Parent = model

	local wallColor = Color3.fromRGB(40, 44, 56)

	local backWall = newPart({
		Name = "BackWall",
		Size = Vector3.new(PLOT_SIZE, WALL_HEIGHT, 2),
		CFrame = originCFrame * CFrame.new(0, WALL_HEIGHT / 2, PLOT_SIZE / 2),
		Color = wallColor,
	})
	backWall.Parent = model

	for _, side in ipairs({ -1, 1 }) do
		local wall = newPart({
			Name = "SideWall",
			Size = Vector3.new(2, WALL_HEIGHT, PLOT_SIZE),
			CFrame = originCFrame * CFrame.new(side * PLOT_SIZE / 2, WALL_HEIGHT / 2, 0),
			Color = wallColor,
		})
		wall.Parent = model
	end

	-- The open side of the base. Turns solid while the base is locked.
	local barrier = newPart({
		Name = "Barrier",
		Size = Vector3.new(PLOT_SIZE, WALL_HEIGHT, 1),
		CFrame = originCFrame * CFrame.new(0, WALL_HEIGHT / 2, -PLOT_SIZE / 2),
		Color = Color3.fromRGB(255, 70, 70),
		Material = Enum.Material.ForceField,
		Transparency = 0.95,
		CanCollide = false,
	})
	barrier.Parent = model

	local pedestals = {}
	for slot = 1, PEDESTAL_COUNT do
		local column = (slot - 1) % 4
		local row = math.floor((slot - 1) / 4)
		local offsetX = (column - 1.5) * 11
		local offsetZ = 6 + row * 12

		local pedestal = newPart({
			Name = "Pedestal",
			Size = Vector3.new(7, 3, 7),
			CFrame = originCFrame * CFrame.new(offsetX, 2, offsetZ),
			Color = Color3.fromRGB(34, 37, 47),
			Material = Enum.Material.Marble,
		})
		pedestal:SetAttribute("Slot", slot)
		pedestal.Parent = model

		local glow = newPart({
			Name = "Glow",
			Size = Vector3.new(6.2, 0.3, 6.2),
			CFrame = originCFrame * CFrame.new(offsetX, 3.6, offsetZ),
			Color = Color3.fromRGB(255, 176, 60),
			Material = Enum.Material.Neon,
			Transparency = 0.35,
		})
		glow.Parent = model

		pedestals[slot] = pedestal
	end

	local depositPad = newPart({
		Name = "DepositPad",
		Size = Vector3.new(14, 0.4, 10),
		CFrame = originCFrame * CFrame.new(0, 0.7, -16),
		Color = Color3.fromRGB(90, 220, 140),
		Material = Enum.Material.Neon,
		Transparency = 0.25,
		CanCollide = false,
	})
	depositPad.Parent = model

	local padSign = Instance.new("SurfaceGui")
	padSign.Face = Enum.NormalId.Top
	padSign.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	padSign.PixelsPerStud = 24
	padSign.LightInfluence = 0
	padSign.Parent = depositPad
	newLabel(padSign, "DROP OFF", UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), Color3.fromRGB(10, 40, 20))

	local lockButton = newPart({
		Name = "LockButton",
		Size = Vector3.new(4, 6, 4),
		CFrame = originCFrame * CFrame.new(-PLOT_SIZE / 2 + 5, 3.5, -14),
		Color = Color3.fromRGB(90, 190, 255),
		Material = Enum.Material.Neon,
	})
	lockButton.Parent = model

	local lockPrompt = Instance.new("ProximityPrompt")
	lockPrompt.Name = "LockPrompt"
	lockPrompt.ActionText = "Lock Base"
	lockPrompt.ObjectText = "Shield"
	lockPrompt.HoldDuration = 0.25
	lockPrompt.MaxActivationDistance = 10
	lockPrompt.RequiresLineOfSight = false
	lockPrompt.Parent = lockButton

	local ownerLabel, incomeLabel = buildSign(model, originCFrame)

	model.PrimaryPart = floor

	return {
		Index = index,
		Model = model,
		Origin = originCFrame,
		Owner = nil,
		Pedestals = pedestals,
		Slots = {},
		Barrier = barrier,
		DepositPad = depositPad,
		LockButton = lockButton,
		LockPrompt = lockPrompt,
		OwnerLabel = ownerLabel,
		IncomeLabel = incomeLabel,
		Locked = false,
		LockReadyAt = 0,
	}
end

local function buildPlaza()
	local plaza = Instance.new("Model")
	plaza.Name = "Plaza"

	local floor = newPart({
		Name = "Floor",
		Size = Vector3.new(70, 1, 70),
		CFrame = CFrame.new(0, 0.5, 0),
		Color = Color3.fromRGB(52, 58, 72),
		Material = Enum.Material.Pebble,
	})
	floor.Parent = plaza

	local pillar = newPart({
		Name = "Monument",
		Size = Vector3.new(6, 18, 6),
		CFrame = CFrame.new(0, 10, 26),
		Color = Color3.fromRGB(255, 176, 60),
		Material = Enum.Material.Neon,
		Transparency = 0.15,
		CanCollide = true,
	})
	pillar.Parent = plaza

	local board = newPart({
		Name = "Welcome",
		Size = Vector3.new(26, 9, 1),
		CFrame = CFrame.new(0, 24, 26),
		Color = Color3.fromRGB(22, 24, 32),
	})
	board.Parent = plaza

	for _, face in ipairs({ Enum.NormalId.Front, Enum.NormalId.Back }) do
		local surface = Instance.new("SurfaceGui")
		surface.Face = face
		surface.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
		surface.PixelsPerStud = 32
		surface.LightInfluence = 0
		surface.Parent = board

		newLabel(
			surface,
			"STEAL A HOT DOG",
			UDim2.fromScale(1, 0.55),
			UDim2.fromScale(0, 0.03),
			Color3.fromRGB(255, 196, 80)
		)
		newLabel(
			surface,
			"Buy them. Guard them. Steal them.",
			UDim2.fromScale(1, 0.3),
			UDim2.fromScale(0, 0.6),
			Color3.fromRGB(235, 235, 245)
		)
	end

	plaza.PrimaryPart = floor
	plaza.Parent = workspace
end

function Plots.Init()
	if #plots > 0 then
		return
	end

	local folder = Instance.new("Folder")
	folder.Name = "Plots"
	folder.Parent = workspace

	for index = 1, PLOT_COUNT do
		local column = (index - 1) % 4
		local row = math.floor((index - 1) / 4)
		local x = (column - 1.5) * 64
		local z = (row == 0) and -64 or 64
		local rotation = (row == 0) and math.pi or 0

		local plot = buildPlot(index, CFrame.new(x, 0.5, z) * CFrame.Angles(0, rotation, 0))
		plot.Model.Parent = folder
		plots[index] = plot
	end

	buildPlaza()
end

function Plots.ByIndex(index)
	return plots[index]
end

function Plots.Get(player)
	for _, plot in ipairs(plots) do
		if plot.Owner == player then
			return plot
		end
	end
	return nil
end

function Plots.Assign(player)
	for _, plot in ipairs(plots) do
		if plot.Owner == nil then
			plot.Owner = player
			player:SetAttribute("PlotIndex", plot.Index)
			Plots.Refresh(plot)
			return plot
		end
	end
	return nil
end

function Plots.Release(player)
	local plot = Plots.Get(player)
	if not plot then
		return
	end

	for slot, model in pairs(plot.Slots) do
		plot.Slots[slot] = nil
		model:Destroy()
	end

	plot.Owner = nil
	plot.Locked = false
	plot.LockReadyAt = 0
	plot.Barrier.CanCollide = false
	plot.Barrier.Transparency = 0.95
	Plots.Refresh(plot)
end

function Plots.FreeSlot(plot)
	for slot = 1, PEDESTAL_COUNT do
		if plot.Slots[slot] == nil then
			return slot
		end
	end
	return nil
end

function Plots.Income(plot)
	local total = 0
	for _, model in pairs(plot.Slots) do
		local info = HotDogData.ById[model:GetAttribute("HotDogId")]
		if info then
			total += info.Income
		end
	end
	return total
end

function Plots.SpawnCFrame(plot)
	return plot.Origin * CFrame.new(0, 4, -8)
end

function Plots.Refresh(plot)
	local owner = plot.Owner
	if owner then
		plot.OwnerLabel.Text = string.upper(owner.DisplayName) .. "'S STAND"
		plot.OwnerLabel.TextColor3 = plot.Locked and Color3.fromRGB(255, 120, 120) or Color3.fromRGB(255, 255, 255)
		plot.IncomeLabel.Text = "$" .. HotDogData.Abbreviate(Plots.Income(plot)) .. " / sec"
			.. (plot.Locked and "  [LOCKED]" or "")
	else
		plot.OwnerLabel.Text = "OPEN BASE"
		plot.OwnerLabel.TextColor3 = Color3.fromRGB(150, 156, 170)
		plot.IncomeLabel.Text = "$0 / sec"
	end
end

-- Returns ok, message
function Plots.Lock(plot)
	if plot.Locked then
		return false, "Your shield is already up."
	end

	local now = os.clock()
	if now < plot.LockReadyAt then
		return false, string.format("Shield recharging (%ds)", math.ceil(plot.LockReadyAt - now))
	end

	plot.Locked = true
	plot.Barrier.CanCollide = true
	plot.Barrier.Transparency = 0.35
	Plots.Refresh(plot)

	task.delay(Plots.LockDuration, function()
		plot.Locked = false
		plot.LockReadyAt = os.clock() + Plots.LockCooldown
		plot.Barrier.CanCollide = false
		plot.Barrier.Transparency = 0.95
		Plots.Refresh(plot)
	end)

	return true, string.format("Shield up for %d seconds!", Plots.LockDuration)
end

return Plots
