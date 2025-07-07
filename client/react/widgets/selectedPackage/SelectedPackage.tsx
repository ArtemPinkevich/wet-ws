import { Box, MenuItem, Select, TextField } from '@mui/material';

import StyledButton from '../../shared/ui/styledButton/StyledButton';

const SelectedPackage = () => {
  const fileName = 'Package.json';
  const menuItems = ['client', 'server', 'WebSocketTransceiver'];

  return (
    <Box>
      <TextField value={fileName} sx={{ width: '100%' }} />
      <TextField
        variant="filled"
        sx={{ width: '100%', height: '100%' }}
      ></TextField>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Box>
          Target:
          <Select value={menuItems[0]}>
            {menuItems.map((item, i) => (
              <MenuItem value={menuItems[i]}>{menuItems[i]}</MenuItem>
            ))}
          </Select>
        </Box>
        <StyledButton>send</StyledButton>
      </Box>
    </Box>
  );
};

export default SelectedPackage;
