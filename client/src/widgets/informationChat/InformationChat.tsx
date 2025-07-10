import {
  Box,
  Checkbox,
  FormControlLabel,
  Stack,
  TextField,
} from '@mui/material';

import { StyledButton } from '../../shared/ui';

interface IInformationChat {
  className?: string;
}

const InformationChat = (props: IInformationChat) => {
  const { className } = props;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        border: '1px solid black',
      }}
      className={className}
    >
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Box>Client</Box>
        <StyledButton>CLEAR</StyledButton>
        <Box>Server</Box>
      </Stack>

      <TextField multiline sx={{ width: '100%' }} />

      <FormControlLabel
        control={<Checkbox defaultChecked />}
        label="Repeater Mode"
        sx={{
          marginTop: 'auto',
          marginBottom: '0',
          position: 'absolute',
          bottom: 0,
        }}
      />
    </Box>
  );
};

export default InformationChat;
