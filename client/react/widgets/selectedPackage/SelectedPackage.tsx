import { Box, MenuItem, Select, TextField } from '@mui/material';

import { StyledButton } from '@/shared/ui';

interface ISelectedPackage {
  classes?: string;
}

const SelectedPackage = (props: ISelectedPackage) => {
  const { classes } = props;

  const fileName = 'Package.json';
  const menuItems = ['client', 'server', 'WebSocketTransceiver'];

  return (
    <Box>
      <TextField
        value={fileName}
        sx={{
          width: '100%',
          border: '1px solid black',
        }}
        className={classes}
      />
      <TextField variant="filled" sx={{ width: '100%' }}></TextField>
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
